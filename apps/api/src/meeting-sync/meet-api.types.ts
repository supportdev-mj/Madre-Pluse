// Shapes read from the Google Meet REST API v2 (meet.googleapis.com). Deliberately minimal —
// only the fields the sync job actually uses, not a full mirror of Google's schema.

export interface MeetConferenceRecord {
  name: string; // e.g. "conferenceRecords/abc123"
  startTime?: string;
  endTime?: string;
  space?: string;
}

export interface MeetConferenceRecordsListResponse {
  conferenceRecords?: MeetConferenceRecord[];
  nextPageToken?: string;
}

export interface MeetTranscript {
  name: string; // e.g. "conferenceRecords/abc123/transcripts/xyz"
  state?: string; // 'STARTED' | 'ENDED' | 'FILE_GENERATED'
}

export interface MeetTranscriptsListResponse {
  transcripts?: MeetTranscript[];
  nextPageToken?: string;
}

export interface MeetTranscriptEntry {
  name: string;
  participant: string; // resource name of a MeetParticipant
  text: string;
  languageCode?: string;
  startTime?: string;
  endTime?: string;
}

export interface MeetTranscriptEntriesListResponse {
  transcriptEntries?: MeetTranscriptEntry[];
  nextPageToken?: string;
}

export interface MeetParticipant {
  name: string;
  signedinUser?: { displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
}

export interface MeetParticipantsListResponse {
  participants?: MeetParticipant[];
  nextPageToken?: string;
}
