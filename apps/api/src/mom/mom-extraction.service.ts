import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { TaskPriorityName } from '@madre-pulse/shared';

export interface ExtractedMomItem {
  title: string;
  description: string;
  responsibleName: string;
  dueDate: string;
  priority: TaskPriorityName;
  context: string;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 8000;
const PRIORITIES: TaskPriorityName[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const EXTRACTION_PROMPT = `You are extracting action items from a Minutes of Meeting (MoM) document. Completeness matters more than anything else here — a missed item is a real task someone won't know about.

Work through the ENTIRE document from start to finish, one agenda item / section at a time. For each section, list every sentence that assigns, requests, or implies work for someone: explicit action items, decisions that require follow-up, open questions someone must resolve, recurring/continuous responsibilities, and anything phrased as "will do", "to check", "needs to", "pending", "TBD", or similar — even if there's no named owner or deadline. Do not skip an item just because it seems minor, already in progress, or informational-sounding — if it requires someone to do something, include it. Do not summarize or merge multiple distinct action items into one entry; give each its own object, even if they're on related topics.

Return a raw JSON array only — no markdown formatting, no backticks, no explanation, just the array itself. Each object must have exactly these fields:
- title: a short task title, max 12 words
- description: 1-3 sentences describing what needs to be done, based only on what the document says
- responsibleName: the name of the person responsible/assigned to this item, exactly as written in the document (or "" if not stated)
- dueDate: the deadline as YYYY-MM-DD if a specific date is stated or can be inferred from the meeting date, otherwise ""
- priority: one of "LOW", "MEDIUM", "HIGH", "URGENT" — infer from urgency language in the text, default to "MEDIUM" if unclear
- context: one short sentence of extra context useful to a reviewer (e.g. which agenda item this came from), or ""

Before you finish, re-scan the document once more specifically looking for anything you may have passed over. If the document contains no action items at all, return an empty array [].`;

function buildVerifyPrompt(alreadyFoundTitles: string[], sourceLabel: string): string {
  const list = alreadyFoundTitles.length > 0 ? alreadyFoundTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(none)';
  return `You already extracted these action items from this ${sourceLabel}:
${list}

Now re-read the ENTIRE ${sourceLabel} again, section by section, specifically hunting for anything that was missed — a second, independent pass. Look especially for: items buried in discussion paragraphs rather than a dedicated "action items" list, items with no explicit owner or deadline, recurring/continuous responsibilities, and follow-ups mentioned only in passing.

Return a raw JSON array of ONLY the missed items, using exactly the same fields as before (title, description, responsibleName, dueDate, priority, context). Do not repeat anything already in the list above. If you're confident nothing was missed, return exactly: []`;
}

const TRANSCRIPT_EXTRACTION_PROMPT = `You are extracting action items from a raw Google Meet transcript (speaker-labeled lines, not a formatted document). Completeness matters more than anything else here — a missed item is a real task someone won't know about.

Work through the ENTIRE transcript from start to finish. For each portion of the conversation, look for every sentence that assigns, requests, or implies work for someone: explicit action items, decisions that require follow-up, open questions someone must resolve, recurring/continuous responsibilities, and anything phrased as "I'll do", "can you check", "we need to", "pending", "TBD", or similar — even if there's no named owner or deadline. Spoken conversation is messier than a written document: infer intent from context (e.g. "yeah I'll handle that" after someone asks a question means that speaker owns it), but don't invent items the conversation doesn't support. Do not summarize or merge multiple distinct action items into one entry; give each its own object.

Return a raw JSON array only — no markdown formatting, no backticks, no explanation, just the array itself. Each object must have exactly these fields:
- title: a short task title, max 12 words
- description: 1-3 sentences describing what needs to be done, based only on what was said
- responsibleName: the speaker name (from the transcript's speaker labels) responsible for this item, exactly as it appears (or "" if unclear)
- dueDate: the deadline as YYYY-MM-DD if a specific date is stated or can be inferred from the meeting date, otherwise ""
- priority: one of "LOW", "MEDIUM", "HIGH", "URGENT" — infer from urgency language in the text, default to "MEDIUM" if unclear
- context: one short sentence of extra context useful to a reviewer (e.g. what part of the discussion this came from), or ""

Before you finish, re-scan the transcript once more specifically looking for anything you may have passed over. If the transcript contains no action items at all, return an empty array [].`;

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  error?: { message?: string };
}

type MessageContentBlock =
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'text'; text: string };

@Injectable()
export class MomExtractionService {
  private readonly logger = new Logger(MomExtractionService.name);

  /** Two passes over the same document: an initial exhaustive extraction, then an independent
   * self-check pass that re-reads the document hunting specifically for anything missed the
   * first time. LLM extraction of a long document in one shot is not reliably exhaustive —
   * this catches items a single pass tends to drop (buried in prose, no explicit owner, etc). */
  async extract(pdfBase64: string, apiKey: string, model: string): Promise<ExtractedMomItem[]> {
    const documentBlock: MessageContentBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    };
    return this.extractWithTwoPasses(documentBlock, apiKey, model, EXTRACTION_PROMPT, 'Minutes of Meeting document');
  }

  /** Same two-pass extraction, over a raw Google Meet transcript's text instead of a PDF. */
  async extractFromTranscript(transcript: string, apiKey: string, model: string): Promise<ExtractedMomItem[]> {
    const textBlock: MessageContentBlock = { type: 'text', text: `Meeting transcript:\n\n${transcript}` };
    return this.extractWithTwoPasses(textBlock, apiKey, model, TRANSCRIPT_EXTRACTION_PROMPT, 'meeting transcript');
  }

  private async extractWithTwoPasses(
    sourceBlock: MessageContentBlock,
    apiKey: string,
    model: string,
    firstPassPrompt: string,
    sourceLabel: string,
  ): Promise<ExtractedMomItem[]> {
    const first = await this.callAndParse(sourceBlock, apiKey, model, firstPassPrompt);

    let second: ExtractedMomItem[] = [];
    try {
      second = await this.callAndParse(sourceBlock, apiKey, model, buildVerifyPrompt(first.map((i) => i.title), sourceLabel));
    } catch (err) {
      // Best-effort — if the verification pass fails, still return what the first pass found
      // rather than failing the whole upload.
      this.logger.warn(`MOM verification pass failed, continuing with first-pass results only: ${(err as Error).message}`);
    }

    const seen = new Set(first.map((i) => this.dedupeKey(i.title)));
    const additional = second.filter((item) => {
      const key = this.dedupeKey(item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return [...first, ...additional];
  }

  private async callAndParse(sourceBlock: MessageContentBlock, apiKey: string, model: string, prompt: string): Promise<ExtractedMomItem[]> {
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          messages: [
            {
              role: 'user',
              content: [sourceBlock, { type: 'text', text: prompt }],
            },
          ],
        }),
      });
    } catch {
      throw new BadRequestException('Could not reach the AI provider. Please try again.');
    }

    const data = (await res.json().catch(() => null)) as AnthropicResponse | null;
    if (!res.ok) {
      const message = data?.error?.message ?? `AI provider returned an error (HTTP ${res.status})`;
      throw new BadRequestException(message);
    }

    const raw = (data?.content ?? []).map((c) => c.text ?? '').join('').trim();
    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim();

    const parsed = this.parseJsonArray(clean);
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Unexpected AI response format.');
    }

    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => this.normalizeItem(item))
      .filter((item) => item.title.length > 0);
  }

  /** If the response got cut off mid-array (hit max_tokens on a long document), salvage every
   * complete object up to the last full `},` rather than discarding the whole extraction. */
  private parseJsonArray(clean: string): unknown {
    try {
      return JSON.parse(clean);
    } catch (err) {
      const lastComplete = clean.lastIndexOf('},');
      if (lastComplete > 0) {
        try {
          return JSON.parse(`${clean.slice(0, lastComplete)}}]`);
        } catch {
          // fall through to the original error below
        }
      }
      throw new BadRequestException(`Could not parse the AI response as JSON: ${(err as Error).message}`);
    }
  }

  private normalizeItem(item: Record<string, unknown>): ExtractedMomItem {
    const priority = String(item.priority ?? '').toUpperCase();
    return {
      title: String(item.title ?? '').trim().slice(0, 200),
      description: String(item.description ?? '').trim().slice(0, 5000),
      responsibleName: String(item.responsibleName ?? '').trim().slice(0, 200),
      dueDate: String(item.dueDate ?? '').trim(),
      priority: (PRIORITIES as string[]).includes(priority) ? (priority as TaskPriorityName) : 'MEDIUM',
      context: String(item.context ?? '').trim().slice(0, 500),
    };
  }

  private dedupeKey(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
  }
}
