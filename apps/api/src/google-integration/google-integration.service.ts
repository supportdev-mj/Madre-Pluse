import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { GoogleIntegrationStatus } from '@madre-pulse/shared';
import type { Env } from '../config/env.validation';
import { decryptSecret, encryptSecret } from '../common/utils/encryption';
import { PrismaService } from '../prisma/prisma.service';

interface GoogleStatePayload {
  orgId: string;
  userId: string;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
}

interface GoogleUserInfo {
  email: string;
}

// meetings.space.readonly covers reading conference records and their transcripts via the Meet
// REST API (conferenceRecords.transcripts.entries) — no Drive access needed, since the Meet API
// returns structured transcript entries directly rather than a Google Doc to parse.
const SCOPES = ['https://www.googleapis.com/auth/meetings.space.readonly', 'https://www.googleapis.com/auth/userinfo.email'];

@Injectable()
export class GoogleIntegrationService {
  private readonly logger = new Logger(GoogleIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  getAuthUrl(orgId: string, userId: string): string {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    const redirectUri = this.config.get('GOOGLE_REDIRECT_URI', { infer: true });
    if (!clientId || !redirectUri) {
      throw new BadRequestException('Google integration is not configured on this server yet');
    }

    const state = this.jwt.sign({ orgId, userId }, { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES.join(' '),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /** Exchanges the OAuth code for tokens and stores the connection. Returns the orgId so the controller can redirect appropriately. */
  async handleCallback(code: string, state: string): Promise<string> {
    let payload: GoogleStatePayload;
    try {
      payload = this.jwt.verify<GoogleStatePayload>(state);
    } catch {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET', { infer: true });
    const redirectUri = this.config.get('GOOGLE_REDIRECT_URI', { infer: true });
    const encryptionKey = this.config.get('TOKEN_ENCRYPTION_KEY', { infer: true });
    if (!clientId || !clientSecret || !redirectUri || !encryptionKey) {
      throw new BadRequestException('Google integration is not configured on this server yet');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      this.logger.warn(`Google token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
      throw new BadRequestException('Failed to exchange authorization code with Google');
    }
    const tokens = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'Google did not return a refresh token. This usually means access was already granted previously — ' +
          'remove Madre Pulse from https://myaccount.google.com/permissions and try connecting again.',
      );
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoRes.ok) {
      throw new BadRequestException('Failed to fetch the connected Google account details');
    }
    const userInfo = (await userInfoRes.json()) as GoogleUserInfo;

    const refreshTokenEncrypted = encryptSecret(tokens.refresh_token, encryptionKey);

    await this.prisma.googleIntegration.upsert({
      where: { orgId: payload.orgId },
      create: {
        orgId: payload.orgId,
        googleEmail: userInfo.email,
        refreshTokenEncrypted,
        connectedById: payload.userId,
      },
      update: {
        googleEmail: userInfo.email,
        refreshTokenEncrypted,
        connectedById: payload.userId,
      },
    });

    return payload.orgId;
  }

  async getStatus(orgId: string): Promise<GoogleIntegrationStatus> {
    const integration = await this.prisma.googleIntegration.findUnique({ where: { orgId } });
    return { connected: !!integration, googleEmail: integration?.googleEmail ?? null };
  }

  /**
   * Exchanges the org's stored refresh token for a fresh access token. Refresh tokens don't
   * expire in normal use, so this doesn't bother caching the access token — every sync run just
   * asks Google for a new one, keeping this stateless rather than tracking a ~1 hour expiry.
   */
  async getAccessToken(orgId: string): Promise<string> {
    const integration = await this.prisma.googleIntegration.findUnique({ where: { orgId } });
    if (!integration) {
      throw new BadRequestException('Google Workspace is not connected for this organization');
    }

    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET', { infer: true });
    const encryptionKey = this.config.get('TOKEN_ENCRYPTION_KEY', { infer: true });
    if (!clientId || !clientSecret || !encryptionKey) {
      throw new BadRequestException('Google integration is not configured on this server yet');
    }

    const refreshToken = decryptSecret(integration.refreshTokenEncrypted, encryptionKey);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!tokenRes.ok) {
      this.logger.warn(`Google access token refresh failed for org ${orgId}: ${tokenRes.status} ${await tokenRes.text()}`);
      throw new BadRequestException('Failed to refresh Google access token');
    }
    const tokens = (await tokenRes.json()) as GoogleTokenResponse;
    return tokens.access_token;
  }

  /** Orgs with an active Google connection, each paired with who connected it — used as the
   * "actor" for auto-synced content, since a background job has no real user in context. */
  async listConnectedOrgs(): Promise<Array<{ orgId: string; connectedById: string }>> {
    return this.prisma.googleIntegration.findMany({ select: { orgId: true, connectedById: true } });
  }

  async disconnect(orgId: string): Promise<void> {
    const integration = await this.prisma.googleIntegration.findUnique({ where: { orgId } });
    if (!integration) return;

    try {
      const encryptionKey = this.config.get('TOKEN_ENCRYPTION_KEY', { infer: true });
      const refreshToken = decryptSecret(integration.refreshTokenEncrypted, encryptionKey);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' });
    } catch (err) {
      // Best-effort: deleting our own record below is what actually matters for "disconnect".
      this.logger.warn(`Failed to revoke Google token with Google (continuing to remove local record): ${err}`);
    }

    await this.prisma.googleIntegration.delete({ where: { orgId } });
  }
}
