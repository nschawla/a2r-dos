/**
 * A2R Delivery OS™ — © 2026 A2R Ventures LLC. All rights reserved.
 * Proprietary and confidential. Licensed, not sold, under the A2R Delivery
 * OS Terms of Service & EULA (/terms).
 *
 * AI Document Parser — turns an unstructured delivery document (a weekly
 * status email, a PMO status report, a set of meeting notes) into the
 * structured "Status Reports & RAID Log" shape the Self-Service Batch
 * Import Engine (src/lib/ingestion/batch-schemas.ts) already knows how to
 * stage, quarantine and commit.
 *
 * It writes NOTHING. `parseDeliveryDocument` returns a draft; the user
 * reviews it and commits through the existing admin-gated batch flow,
 * which re-validates every row server-side exactly as it does for an
 * uploaded CSV. This module is deliberately a read-only assistant.
 *
 * Split so the network-free parts — prompt construction, the response
 * schema, tool-input extraction, and the flatten-to-batch-rows adapter —
 * are plain functions, leaving one thin impure entry point
 * (`parseDeliveryDocument`) that talks to the model.
 *
 * Config: requires `ANTHROPIC_API_KEY` in the environment.
 * `parseDeliveryDocument` never throws — it returns
 * `{ ok: false, code: 'not-configured' }` when the key is missing, so the
 * route can answer a clean 503.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { captureException } from '@/lib/observability';

/**
 * The model powering extraction. Sonnet 5 is the default: this is a
 * structured-extraction task where a misclassified RISK-vs-ISSUE or an
 * invented RAID item has real downstream cost, so accuracy wins over
 * price here. For very high document volume, 'claude-haiku-4-5-20251001'
 * is a reasonable swap with the same prompt and schema.
 */
export const PARSER_MODEL = 'claude-sonnet-5';

/** Hard ceiling on the document text we'll send to the model. */
export const MAX_INPUT_CHARS = 50_000;

/** Response ceiling — the digest is compact; 4k tokens is generous. */
const MAX_OUTPUT_TOKENS = 4096;

// ─────────────────────────────────────────────────────────────────────────
// Response schema — mirrored by PARSE_TOOL.input_schema below, and used to
// validate whatever the model actually returns before we trust it.
// The vocabularies match src/lib/ingestion/batch-schemas.ts exactly
// (StatusRaidType / StatusRaidSeverity) so the output drops straight into
// the STATUS_RAID validator.
// ─────────────────────────────────────────────────────────────────────────

const raidTypeEnum = z.enum(['RISK', 'ASSUMPTION', 'ISSUE', 'DEPENDENCY']);
const raidSeverityEnum = z.enum(['CRITICAL', 'HIGH', 'MED', 'LOW']);

export const RAID_TYPES = raidTypeEnum.options;
export const RAID_SEVERITIES = raidSeverityEnum.options;
export type RaidType = z.infer<typeof raidTypeEnum>;
export type RaidSeverity = z.infer<typeof raidSeverityEnum>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const parsedRaidItemSchema = z.object({
  type: raidTypeEnum,
  description: z.string().trim().min(1),
  severity: raidSeverityEnum,
  /** A name or email exactly as the document wrote it — resolved to a
   * real Resource later, by the batch validator, not here. */
  ownerRef: z.string().trim().min(1).nullable(),
});

const parsedProjectDigestSchema = z.object({
  /** The project code or name as written in the document. */
  projectRef: z.string().trim().min(1),
  /** ISO yyyy-mm-dd if the document dates this update, else null. */
  weekEnding: z.string().regex(ISO_DATE).nullable(),
  /** A rolled-up narrative highlight for the week, or null if the
   * document only carried RAID items for this project. */
  narrative: z.string().trim().min(1).nullable(),
  raid: z.array(parsedRaidItemSchema),
});

export const parsedDocumentSchema = z.object({
  entries: z.array(parsedProjectDigestSchema),
  /** Anything meaningful the model could not attribute to a specific
   * project — surfaced to the user rather than dropped. */
  unattributed: z.array(z.string().trim().min(1)),
});

export type ParsedRaidItem = z.infer<typeof parsedRaidItemSchema>;
export type ParsedProjectDigest = z.infer<typeof parsedProjectDigestSchema>;
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

export interface KnownProject {
  /** Project.externalId — the "Project Code" the client's systems use. */
  code: string | null;
  name: string;
}

export interface ParseDocumentInput {
  /** The raw document text. */
  text: string;
  /** The tenant's engagements, so the model can resolve "the Contoso
   * migration" to a real project code instead of guessing. */
  knownProjects?: KnownProject[];
  /** Week-ending (ISO yyyy-mm-dd) applied to any entry the document does
   * not date itself. */
  defaultWeekEnding?: string | null;
}

export type ParseErrorCode =
  | 'not-configured' //  ANTHROPIC_API_KEY missing            → 503
  | 'empty-input' //     nothing to parse                     → 400
  | 'input-too-large' // over MAX_INPUT_CHARS                 → 413
  | 'model-error' //     upstream API failure / timeout       → 502
  | 'unparseable'; //    model returned nothing schema-valid  → 422

export type ParseDocumentResult =
  | {
      ok: true;
      data: ParsedDocument;
      model: string;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { ok: false; code: ParseErrorCode; error: string };

export interface ParseDocumentOptions {
  /** Override PARSER_MODEL for one call. */
  model?: string;
  /** Inject a client in tests. Defaults to a fresh Anthropic() reading
   * ANTHROPIC_API_KEY. */
  client?: Pick<Anthropic, 'messages'>;
}

/**
 * The forced tool the model answers through — its `input_schema` mirrors
 * `parsedDocumentSchema`. Forcing a tool call is more reliable than
 * asking for raw JSON and gives us a typed block to read.
 */
export const PARSE_TOOL: Anthropic.Tool = {
  name: 'record_status_digest',
  description:
    'Record the delivery status narrative and RAID items extracted from the document, grouped by engagement.',
  input_schema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        description: 'One entry per engagement mentioned in the document.',
        items: {
          type: 'object',
          properties: {
            projectRef: {
              type: 'string',
              description:
                'The engagement code or name exactly as written in the document. Prefer a code from the known-projects list when the reference is unambiguous.',
            },
            weekEnding: {
              type: ['string', 'null'],
              description: 'ISO yyyy-mm-dd if the document states the reporting week for this engagement, otherwise null.',
            },
            narrative: {
              type: ['string', 'null'],
              description:
                'A concise status highlight for the week in the document\'s own words, or null if only RAID items were reported for this engagement.',
            },
            raid: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: [...RAID_TYPES] },
                  description: { type: 'string' },
                  severity: { type: 'string', enum: [...RAID_SEVERITIES] },
                  ownerRef: {
                    type: ['string', 'null'],
                    description: 'Owner name or email as written, or null if unstated.',
                  },
                },
                required: ['type', 'description', 'severity', 'ownerRef'],
              },
            },
          },
          required: ['projectRef', 'weekEnding', 'narrative', 'raid'],
        },
      },
      unattributed: {
        type: 'array',
        items: { type: 'string' },
        description: 'Meaningful status or risk statements that could not be tied to a specific engagement.',
      },
    },
    required: ['entries', 'unattributed'],
  },
};

export function buildSystemPrompt(): string {
  return [
    'You extract structured weekly delivery status from professional-services documents',
    '(status emails, PMO reports, meeting notes) for import into a delivery management system.',
    '',
    'Rules:',
    '- Extract ONLY what the document actually states. Never invent a RAID item, an owner, a date, or a status.',
    '- A "RAID" item is a Risk, Assumption, Issue, or Dependency. Classify conservatively:',
    '  RISK = something that might happen; ISSUE = something that already has; ',
    '  ASSUMPTION = a stated premise; DEPENDENCY = a reliance on another team/vendor/decision.',
    '- Severity: use the document\'s own wording (critical/high/medium/low). When severity is not stated, use "MED".',
    '- narrative is a short highlight of where the engagement stands this week — one or two sentences, the document\'s substance, not a restatement of every RAID item.',
    '- Map each engagement reference to a code from the known-projects list when the match is unambiguous; otherwise pass the reference through verbatim.',
    '- Put any meaningful statement you cannot attribute to a specific engagement into "unattributed".',
    '- Respond only through the record_status_digest tool.',
  ].join('\n');
}

export function buildUserPrompt(input: ParseDocumentInput): string {
  const parts: string[] = [];

  if (input.knownProjects && input.knownProjects.length > 0) {
    parts.push('Known engagements for this organization (code — name):');
    for (const p of input.knownProjects.slice(0, 500)) {
      parts.push(`- ${p.code ? `${p.code} — ` : ''}${p.name}`);
    }
    parts.push('');
  }

  if (input.defaultWeekEnding) {
    parts.push(`If an entry does not state its own reporting week, use ${input.defaultWeekEnding}.`);
    parts.push('');
  }

  parts.push('Document:');
  parts.push('"""');
  parts.push(input.text.trim());
  parts.push('"""');

  return parts.join('\n');
}

/** Pure: pull the forced tool call's input off a model response. */
export function extractToolInput(message: Anthropic.Message, toolName: string = PARSE_TOOL.name): unknown {
  for (const block of message.content) {
    if (block.type === 'tool_use' && block.name === toolName) return block.input;
  }
  return null;
}

/**
 * Parse one document. Never throws: every failure path resolves to
 * `{ ok: false, code, error }`.
 */
export async function parseDeliveryDocument(
  input: ParseDocumentInput,
  options: ParseDocumentOptions = {},
): Promise<ParseDocumentResult> {
  const text = (input.text ?? '').trim();
  if (text.length === 0) {
    return { ok: false, code: 'empty-input', error: 'The document is empty.' };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      code: 'input-too-large',
      error: `The document is ${text.length.toLocaleString()} characters; the limit is ${MAX_INPUT_CHARS.toLocaleString()}. Split it and parse each part.`,
    };
  }

  let client = options.client;
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false,
        code: 'not-configured',
        error: 'The document parser is not configured (ANTHROPIC_API_KEY is not set).',
      };
    }
    client = new Anthropic({ apiKey });
  }

  const model = options.model ?? PARSER_MODEL;

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(),
      tools: [PARSE_TOOL],
      tool_choice: { type: 'tool', name: PARSE_TOOL.name },
      messages: [{ role: 'user', content: buildUserPrompt({ ...input, text }) }],
    });
  } catch (err) {
    captureException(err, { scope: 'ai-parser', model, phase: 'model-call' });
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, code: 'model-error', error: 'The document parser\'s API key was rejected.' };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, code: 'model-error', error: 'The document parser is rate-limited upstream. Try again shortly.' };
    }
    const detail = err instanceof Error ? err.message : 'unknown error';
    return { ok: false, code: 'model-error', error: `The document parser could not reach the model (${detail}).` };
  }

  const rawInput = extractToolInput(message);
  if (rawInput == null) {
    captureException(new Error('parser response had no tool_use block'), {
      scope: 'ai-parser',
      model,
      phase: 'extract',
      stopReason: message.stop_reason,
    });
    return { ok: false, code: 'unparseable', error: 'The model did not return a structured result.' };
  }

  const parsed = parsedDocumentSchema.safeParse(rawInput);
  if (!parsed.success) {
    captureException(new Error('parser response failed schema validation'), {
      scope: 'ai-parser',
      model,
      phase: 'validate',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return { ok: false, code: 'unparseable', error: 'The model returned a result that did not match the expected shape.' };
  }

  // Apply the fallback week to any entry the document did not date.
  const data: ParsedDocument = {
    ...parsed.data,
    entries: parsed.data.entries.map((e) => ({
      ...e,
      weekEnding: e.weekEnding ?? input.defaultWeekEnding ?? null,
    })),
  };

  return {
    ok: true,
    data,
    model,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Adapter → Self-Service Batch Import Engine (STATUS_RAID pillar)
// ─────────────────────────────────────────────────────────────────────────

/** The exact header set `validateStatusRaidRow` reads (batch-schemas.ts). */
export const STATUS_RAID_ROW_HEADERS = [
  'Project Code',
  'Week Ending',
  'Status Narrative',
  'RAID Type',
  'RAID Description',
  'RAID Severity',
  'RAID Owner Email',
] as const;

const RAID_TYPE_TITLE: Record<RaidType, string> = {
  RISK: 'Risk',
  ASSUMPTION: 'Assumption',
  ISSUE: 'Issue',
  DEPENDENCY: 'Dependency',
};
const RAID_SEVERITY_TITLE: Record<RaidSeverity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MED: 'Med',
  LOW: 'Low',
};

/**
 * Flatten a parsed digest into `Record<string, string>[]` rows shaped for
 * the STATUS_RAID pill of the batch importer — one row per RAID item, plus
 * a narrative-only row for an engagement that reported a highlight but no
 * RAID. The narrative rides on the FIRST row for an engagement only, so a
 * digest with three RAID items doesn't create three duplicate Activity
 * Log entries on commit.
 */
export function toStatusRaidRows(doc: ParsedDocument): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const entry of doc.entries) {
    const base = {
      'Project Code': entry.projectRef,
      'Week Ending': entry.weekEnding ?? '',
    };

    if (entry.raid.length === 0) {
      if (entry.narrative) {
        rows.push({
          ...base,
          'Status Narrative': entry.narrative,
          'RAID Type': '',
          'RAID Description': '',
          'RAID Severity': '',
          'RAID Owner Email': '',
        });
      }
      continue;
    }

    entry.raid.forEach((item, i) => {
      rows.push({
        ...base,
        'Status Narrative': i === 0 && entry.narrative ? entry.narrative : '',
        'RAID Type': RAID_TYPE_TITLE[item.type],
        'RAID Description': item.description,
        'RAID Severity': RAID_SEVERITY_TITLE[item.severity],
        'RAID Owner Email': item.ownerRef ?? '',
      });
    });
  }

  return rows;
}
