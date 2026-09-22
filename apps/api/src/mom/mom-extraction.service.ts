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

export interface ExtractionResult {
  minutes: string | null;
  items: ExtractedMomItem[];
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 8000;
const PRIORITIES: TaskPriorityName[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const ACTION_ITEM_FIELDS = `- title: a short task title, max 12 words
- description: 1-3 sentences describing what needs to be done, based only on what the source actually says
- responsibleName: the name of the person responsible/assigned to this item, exactly as it appears in the source (or "" if not stated)
- dueDate: the deadline as YYYY-MM-DD if a specific date is stated or can be inferred from the meeting date, otherwise ""
- priority: one of "LOW", "MEDIUM", "HIGH", "URGENT" — infer from urgency language in the text, default to "MEDIUM" if unclear
- context: one short sentence of extra context useful to a reviewer (e.g. which agenda item / part of the discussion this came from), or ""`;

const EXTRACTION_PROMPT = `You are turning a Minutes of Meeting (MoM) document into two things: (1) a clean, well-formatted set of meeting minutes, and (2) a complete list of action items. Completeness on the action items matters most — a missed item is a real task someone won't know about.

For the action items: work through the ENTIRE document from start to finish, one agenda item / section at a time. List every sentence that assigns, requests, or implies work for someone: explicit action items, decisions that require follow-up, open questions someone must resolve, recurring/continuous responsibilities, and anything phrased as "will do", "to check", "needs to", "pending", "TBD", or similar — even if there's no named owner or deadline. Do not skip an item just because it seems minor, already in progress, or informational-sounding — if it requires someone to do something, include it. Do not summarize or merge multiple distinct action items into one entry; give each its own object, even if they're on related topics.

For the minutes: write a well-formatted markdown summary of the meeting — attendees if identifiable, a discussion summary grouped by topic/agenda item, and key decisions made. Base it only on what the document actually says; don't invent structure the document doesn't support.

Return a raw JSON object only — no markdown formatting, no backticks, no explanation, just the object itself, matching exactly this shape:
{
  "minutes": string,
  "actionItems": [ { ... } ]
}
Each object in actionItems must have exactly these fields:
${ACTION_ITEM_FIELDS}

Before you finish, re-scan the document once more specifically looking for any action item you may have passed over. If the document contains no action items at all, use an empty array for actionItems (never omit the field).`;

function buildVerifyPrompt(alreadyFoundTitles: string[], sourceLabel: string): string {
  const list = alreadyFoundTitles.length > 0 ? alreadyFoundTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(none)';
  return `You already extracted these action items from this ${sourceLabel}:
${list}

Now re-read the ENTIRE ${sourceLabel} again, section by section, specifically hunting for anything that was missed — a second, independent pass. Look especially for: items buried in discussion paragraphs rather than a dedicated "action items" list, items with no explicit owner or deadline, recurring/continuous responsibilities, and follow-ups mentioned only in passing.

Return a raw JSON array of ONLY the missed items, using exactly the same fields as before (title, description, responsibleName, dueDate, priority, context). Do not repeat anything already in the list above. If you're confident nothing was missed, return exactly: []`;
}

const TRANSCRIPT_EXTRACTION_PROMPT = `You are turning a raw Google Meet transcript (speaker-labeled lines, not a formatted document) into two things: (1) a clean, well-formatted set of meeting minutes, and (2) a complete list of action items. Completeness on the action items matters most — a missed item is a real task someone won't know about.

For the action items: work through the ENTIRE transcript from start to finish. List every sentence that assigns, requests, or implies work for someone: explicit action items, decisions that require follow-up, open questions someone must resolve, recurring/continuous responsibilities, and anything phrased as "I'll do", "can you check", "we need to", "pending", "TBD", or similar — even if there's no named owner or deadline. Spoken conversation is messier than a written document: infer intent from context (e.g. "yeah I'll handle that" after someone asks a question means that speaker owns it), but don't invent items the conversation doesn't support. Do not summarize or merge multiple distinct action items into one entry; give each its own object.

For the minutes: write a well-formatted markdown summary of the meeting — attendees (from the transcript's speaker labels) if identifiable, a discussion summary grouped by topic, and key decisions made. Base it only on what was actually said.

Return a raw JSON object only — no markdown formatting, no backticks, no explanation, just the object itself, matching exactly this shape:
{
  "minutes": string,
  "actionItems": [ { ... } ]
}
Each object in actionItems must have exactly these fields (responsibleName is the speaker label):
${ACTION_ITEM_FIELDS}

Before you finish, re-scan the transcript once more specifically looking for any action item you may have passed over. If the transcript contains no action items at all, use an empty array for actionItems (never omit the field).`;

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

  /**
   * First pass produces both the formatted minutes and an initial action-item extraction in one
   * call; a second, independent pass then re-reads the same source hunting specifically for
   * action items the first pass missed (LLM extraction of a long source in one shot isn't
   * reliably exhaustive). Minutes are only generated once — a second summarization pass doesn't
   * add value the way a second "did I miss an action item" pass does.
   */
  async extract(pdfBase64: string, apiKey: string, model: string): Promise<ExtractionResult> {
    const documentBlock: MessageContentBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
    };
    return this.extractWithTwoPasses(documentBlock, apiKey, model, EXTRACTION_PROMPT, 'Minutes of Meeting document');
  }

  /** Same two-pass extraction, over a raw Google Meet transcript's text instead of a PDF. */
  async extractFromTranscript(transcript: string, apiKey: string, model: string): Promise<ExtractionResult> {
    const textBlock: MessageContentBlock = { type: 'text', text: `Meeting transcript:\n\n${transcript}` };
    return this.extractWithTwoPasses(textBlock, apiKey, model, TRANSCRIPT_EXTRACTION_PROMPT, 'meeting transcript');
  }

  private async extractWithTwoPasses(
    sourceBlock: MessageContentBlock,
    apiKey: string,
    model: string,
    firstPassPrompt: string,
    sourceLabel: string,
  ): Promise<ExtractionResult> {
    // The first pass produces minutes + action items in one call, so a failure here fails the
    // whole extraction — same as before this changed, since it's still the primary AI call.
    const { minutes, items: first } = await this.callAndParseFirstPass(sourceBlock, apiKey, model, firstPassPrompt);

    let second: ExtractedMomItem[] = [];
    try {
      second = await this.callAndParseItemsOnly(sourceBlock, apiKey, model, buildVerifyPrompt(first.map((i) => i.title), sourceLabel));
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

    return { minutes, items: [...first, ...additional] };
  }

  private async callAndParseFirstPass(
    sourceBlock: MessageContentBlock,
    apiKey: string,
    model: string,
    prompt: string,
  ): Promise<{ minutes: string | null; items: ExtractedMomItem[] }> {
    const clean = await this.callAnthropic(sourceBlock, apiKey, model, prompt);
    const parsed = this.parseFirstPassObject(clean);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('Unexpected AI response format.');
    }

    const obj = parsed as Record<string, unknown>;
    const minutes = typeof obj.minutes === 'string' && obj.minutes.trim().length > 0 ? obj.minutes.trim() : null;
    const rawItems = Array.isArray(obj.actionItems) ? obj.actionItems : [];
    const items = rawItems
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => this.normalizeItem(item))
      .filter((item) => item.title.length > 0);

    return { minutes, items };
  }

  private async callAndParseItemsOnly(sourceBlock: MessageContentBlock, apiKey: string, model: string, prompt: string): Promise<ExtractedMomItem[]> {
    const clean = await this.callAnthropic(sourceBlock, apiKey, model, prompt);
    const parsed = this.parseJsonArray(clean);
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Unexpected AI response format.');
    }

    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => this.normalizeItem(item))
      .filter((item) => item.title.length > 0);
  }

  private async callAnthropic(sourceBlock: MessageContentBlock, apiKey: string, model: string, prompt: string): Promise<string> {
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
    return raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim();
  }

  /**
   * The first pass now asks for one JSON object (`{ minutes, actionItems }`) instead of a bare
   * array — a bigger response in the same MAX_TOKENS budget than before, so truncation on a long
   * source is more likely, not less. If straight parsing fails, assume the cut happened inside
   * the actionItems array (minutes is emitted first and is far shorter, so it's very unlikely to
   * be the truncated part) and salvage every complete item up to the last full `},`, closing off
   * the item, the array, and the outer object — the same recovery `parseJsonArray` does for the
   * verification pass, just one level deeper.
   */
  private parseFirstPassObject(clean: string): unknown {
    try {
      return JSON.parse(clean);
    } catch (err) {
      const lastComplete = clean.lastIndexOf('},');
      if (lastComplete > 0) {
        try {
          return JSON.parse(`${clean.slice(0, lastComplete)}}]}`);
        } catch {
          // fall through to the original error below
        }
      }
      throw new BadRequestException(`Could not parse the AI response as JSON: ${(err as Error).message}`);
    }
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
