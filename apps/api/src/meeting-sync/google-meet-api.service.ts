import { Injectable, Logger } from '@nestjs/common';
import type {
  MeetConferenceRecord,
  MeetConferenceRecordsListResponse,
  MeetParticipant,
  MeetParticipantsListResponse,
  MeetTranscript,
  MeetTranscriptEntriesListResponse,
  MeetTranscriptsListResponse,
} from './meet-api.types';

const MEET_API_BASE = 'https://meet.googleapis.com/v2';

/** A thin wrapper over the Meet REST API v2 — no DB access, just fetch calls against a given access token. */
@Injectable()
export class GoogleMeetApiService {
  private readonly logger = new Logger(GoogleMeetApiService.name);

  async listConferenceRecords(accessToken: string): Promise<MeetConferenceRecord[]> {
    const res = await this.get(accessToken, `${MEET_API_BASE}/conferenceRecords?pageSize=25`);
    if (!res) return [];
    const body = (await res.json()) as MeetConferenceRecordsListResponse;
    return body.conferenceRecords ?? [];
  }

  /** Returns a formatted `Speaker: text` transcript, or null if this meeting has no ended transcript yet. */
  async getTranscriptText(accessToken: string, record: MeetConferenceRecord): Promise<string | null> {
    const transcriptsRes = await this.get(accessToken, `${MEET_API_BASE}/${record.name}/transcripts`);
    if (!transcriptsRes) return null;
    const transcriptsBody = (await transcriptsRes.json()) as MeetTranscriptsListResponse;
    const transcript = (transcriptsBody.transcripts ?? []).find(
      (t: MeetTranscript) => t.state === 'ENDED' || t.state === 'FILE_GENERATED',
    );
    if (!transcript) return null;

    const [entriesRes, participantsRes] = await Promise.all([
      this.get(accessToken, `${MEET_API_BASE}/${transcript.name}/entries?pageSize=200`),
      this.get(accessToken, `${MEET_API_BASE}/${record.name}/participants?pageSize=100`),
    ]);
    if (!entriesRes) return null;

    const entriesBody = (await entriesRes.json()) as MeetTranscriptEntriesListResponse;
    const entries = entriesBody.transcriptEntries ?? [];
    if (entries.length === 0) return null;

    const participants = participantsRes ? ((await participantsRes.json()) as MeetParticipantsListResponse).participants ?? [] : [];
    const nameByResource = new Map(participants.map((p: MeetParticipant) => [p.name, this.displayNameOf(p)]));

    return entries.map((entry) => `${nameByResource.get(entry.participant) ?? 'Unknown speaker'}: ${entry.text}`).join('\n');
  }

  private displayNameOf(p: MeetParticipant): string {
    return p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName ?? 'Unknown speaker';
  }

  /** Wraps a Meet API GET so one bad request logs and returns null instead of throwing — a single
   * meeting's transient API hiccup shouldn't abort the rest of an org's sync run. */
  private async get(accessToken: string, url: string): Promise<Response | null> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      this.logger.warn(`Meet API request failed (${res.status}) for ${url}: ${await res.text()}`);
      return null;
    }
    return res;
  }
}
