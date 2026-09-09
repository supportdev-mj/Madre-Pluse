import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { GoogleMeetSyncResult } from '@madre-pulse/shared';
import { GoogleIntegrationService } from '../google-integration/google-integration.service';
import { MomService } from '../mom/mom.service';
import { GoogleMeetApiService } from './google-meet-api.service';

const SYNC_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class MeetingSyncService implements OnModuleInit {
  private readonly logger = new Logger(MeetingSyncService.name);

  constructor(
    private readonly googleIntegration: GoogleIntegrationService,
    private readonly meetApi: GoogleMeetApiService,
    private readonly momService: MomService,
    @InjectQueue('meeting-sync') private readonly syncQueue: Queue,
  ) {}

  /** Registers the repeatable poll as a BullMQ job. A fixed jobId means re-registering on every app restart doesn't create duplicate schedules. */
  async onModuleInit(): Promise<void> {
    await this.syncQueue.add('scan', {}, { repeat: { every: SYNC_INTERVAL_MS }, jobId: 'meeting-sync-scan' });
  }

  /** Auto-poll entry point: every org with a connected Google account, one after another. A
   * failure syncing one org (missing AI key, a revoked Google token, a Meet API error) is logged
   * and skipped — it must never stop the rest of the orgs from syncing. */
  async syncAllConnectedOrgs(): Promise<void> {
    const orgs = await this.googleIntegration.listConnectedOrgs();
    let totalSynced = 0;
    for (const { orgId, connectedById } of orgs) {
      try {
        const result = await this.syncOrg(orgId, connectedById);
        totalSynced += result.meetingsSynced;
      } catch (err) {
        this.logger.warn(`Meeting sync failed for org ${orgId}: ${err}`);
      }
    }
    this.logger.log(`Meeting sync: scanned ${orgs.length} org(s), synced ${totalSynced} meeting(s)`);
  }

  /** Syncs one org's ended, transcribed meetings into the MOM review queue. Used both by the
   * auto-poll above and by the "Sync now" button (foreground request, real actor). Errors here
   * (no AI key configured, Google token revoked, etc.) are left to propagate — the foreground
   * caller wants that as real, actionable feedback rather than a silently-empty result. */
  async syncOrg(orgId: string, actorId: string): Promise<GoogleMeetSyncResult> {
    const accessToken = await this.googleIntegration.getAccessToken(orgId);
    const records = await this.meetApi.listConferenceRecords(accessToken);

    let meetingsSynced = 0;
    let itemsNew = 0;
    let itemsSkipped = 0;
    for (const record of records) {
      const transcript = await this.meetApi.getTranscriptText(accessToken, record);
      if (!transcript) continue; // no ended transcript yet for this meeting

      const result = await this.momService.ingestGoogleMeetTranscript(
        orgId,
        actorId,
        `Google Meet — ${this.formatMeetingDate(record.startTime)}`,
        record.name,
        transcript,
      );
      if (!result) continue; // already synced in a previous run

      meetingsSynced++;
      itemsNew += result.itemsNew;
      itemsSkipped += result.itemsSkipped;
    }

    return { meetingsChecked: records.length, meetingsSynced, itemsNew, itemsSkipped };
  }

  private formatMeetingDate(startTime: string | undefined): string {
    return startTime ? new Date(startTime).toLocaleString() : new Date().toLocaleString();
  }
}
