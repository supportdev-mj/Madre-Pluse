import { createHash, randomBytes } from 'crypto';
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthOrg, AuthUser, ChangePasswordInput, LoginInput, RegisterInput, RoleName } from '@madre-pulse/shared';
import type { Env } from '../config/env.validation';
import { deriveInitials, pickAvatarColor } from '../common/utils/avatar';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './jwt-payload.type';
import { parseDurationMs } from './utils/duration';
import { randomSlugSuffix, slugify } from './utils/slugify';

export const REFRESH_COOKIE_NAME = 'refresh_token';

const BCRYPT_ROUNDS = 10;

interface UserRecord {
  id: string;
  email: string;
  name: string;
  initials: string;
  avatarColor: string;
  isSuperAdmin: boolean;
}

interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface AuthResult {
  user: AuthUser;
  org: AuthOrg;
  role: RoleName;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();

    let slug = slugify(input.orgName);
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.prisma.organization.findUnique({ where: { slug } });
      if (!existing) break;
      slug = `${slugify(input.orgName)}-${randomSlugSuffix()}`;
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const initials = deriveInitials(input.name);
    const avatarColor = pickAvatarColor(input.name + email);

    try {
      const { org, user, membership } = await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: input.orgName, slug } });
        const user = await tx.user.create({
          data: { email, passwordHash, name: input.name, initials, avatarColor },
        });
        const membership = await tx.membership.create({
          data: { userId: user.id, orgId: org.id, role: 'ADMIN', status: 'ACTIVE' },
        });
        return { org, user, membership };
      });

      return this.issueSession(user, org, membership.role as RoleName);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw err;
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw new ForbiddenException('No active organization membership');
    }

    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: membership.orgId } });
    this.assertOrgActive(org);
    return this.issueSession(user, org, membership.role as RoleName);
  }

  async refresh(rawToken: string | undefined): Promise<RefreshResult> {
    if (!rawToken) throw new UnauthorizedException('Missing refresh token');

    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      // Reuse of an already-rotated token signals possible theft: kill the whole session family.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) throw new ForbiddenException('No active organization membership');
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: membership.orgId } });
    this.assertOrgActive(org);

    const created = await this.createRefreshToken(user.id);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: created.recordId },
    });

    const accessToken = this.signAccessToken(user.id, org.id, membership.role as RoleName, user.email, user.isSuperAdmin);
    return { accessToken, refreshToken: created.refreshToken, refreshTokenExpiresAt: created.expiresAt };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(payload: JwtPayload): Promise<{ user: AuthUser; org: AuthOrg; role: RoleName }> {
    const [user, org] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: payload.orgId } }),
    ]);
    return { user: await this.toAuthUser(user, payload.orgId), org: this.toAuthOrg(org), role: payload.role };
  }

  /** currentRawRefreshToken (if provided) is left alone so the session making this change doesn't
   * get logged out too — every *other* refresh token for this user is revoked, forcing re-auth
   * everywhere else, same "kill the family" treatment as detected refresh-token reuse. */
  async changePassword(userId: string, input: ChangePasswordInput, currentRawRefreshToken?: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    const currentTokenHash = currentRawRefreshToken ? this.hashToken(currentRawRefreshToken) : undefined;

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null, ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}) },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueSession(user: UserRecord, org: OrgRecord, role: RoleName): Promise<AuthResult> {
    const accessToken = this.signAccessToken(user.id, org.id, role, user.email, user.isSuperAdmin);
    const created = await this.createRefreshToken(user.id);

    return {
      user: await this.toAuthUser(user, org.id),
      org: this.toAuthOrg(org),
      role,
      accessToken,
      refreshToken: created.refreshToken,
      refreshTokenExpiresAt: created.expiresAt,
    };
  }

  private signAccessToken(userId: string, orgId: string, role: RoleName, email: string, isSuperAdmin: boolean): string {
    const payload: JwtPayload = { sub: userId, orgId, role, email, isSuperAdmin };
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  /** Suspension takes effect within one access-token lifetime (≤15m, next login/refresh), not instantly — same tolerance already accepted for stale role claims. */
  private assertOrgActive(org: OrgRecord): void {
    if (org.status === 'SUSPENDED') {
      throw new ForbiddenException('This organization has been suspended');
    }
  }

  private async createRefreshToken(userId: string): Promise<{ refreshToken: string; expiresAt: Date; recordId: string }> {
    const refreshToken = randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const ttlMs = parseDurationMs(this.config.get('JWT_REFRESH_TTL', { infer: true }));
    const expiresAt = new Date(Date.now() + ttlMs);

    const record = await this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

    return { refreshToken, expiresAt, recordId: record.id };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async toAuthUser(user: UserRecord, orgId: string): Promise<AuthUser> {
    const membership = await this.prisma.membership.findFirst({ where: { userId: user.id, orgId }, select: { id: true } });
    const hasDirectReports = membership
      ? (await this.prisma.membership.count({ where: { orgId, managerId: membership.id } })) > 0
      : false;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      avatarColor: user.avatarColor,
      isSuperAdmin: user.isSuperAdmin,
      hasDirectReports,
    };
  }

  private toAuthOrg(org: OrgRecord): AuthOrg {
    return { id: org.id, name: org.name, slug: org.slug };
  }
}
