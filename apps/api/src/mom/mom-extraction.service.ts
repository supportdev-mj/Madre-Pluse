import { BadRequestException, Injectable } from '@nestjs/common';
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

const EXTRACTION_PROMPT = `You are extracting action items from a Minutes of Meeting (MoM) document.

Extract EVERY distinct action item, task, or follow-up mentioned. Return a raw JSON array only — no markdown formatting, no backticks, no explanation, just the array itself. Each object must have exactly these fields:
- title: a short task title, max 12 words
- description: 1-3 sentences describing what needs to be done, based only on what the document says
- responsibleName: the name of the person responsible/assigned to this item, exactly as written in the document (or "" if not stated)
- dueDate: the deadline as YYYY-MM-DD if a specific date is stated or can be inferred from the meeting date, otherwise ""
- priority: one of "LOW", "MEDIUM", "HIGH", "URGENT" — infer from urgency language in the text, default to "MEDIUM" if unclear
- context: one short sentence of extra context useful to a reviewer (e.g. which agenda item this came from), or ""

If the document contains no action items, return an empty array [].`;

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  error?: { message?: string };
}

@Injectable()
export class MomExtractionService {
  async extract(pdfBase64: string, apiKey: string, model: string): Promise<ExtractedMomItem[]> {
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
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
                { type: 'text', text: EXTRACTION_PROMPT },
              ],
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(clean);
    } catch {
      throw new BadRequestException('Could not parse the AI response as JSON. Please try the upload again.');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Unexpected AI response format.');
    }

    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => this.normalizeItem(item))
      .filter((item) => item.title.length > 0);
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
}
