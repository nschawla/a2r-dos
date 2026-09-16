/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Monday.com adapter — read-only item/status counts via the GraphQL API
 * (`api.monday.com/v2`). Every request sent is a `query`, never a
 * `mutation` — see PullResult below for the exact text. Auth: an API
 * token in the `Authorization` header (no "Bearer" prefix — Monday's own
 * convention).
 *
 * `config`: { boardId }. `credential`: the API token.
 */
import { postJson } from '../http';
import { notConfiguredError } from '../errors';
import { classifySchemaMismatch } from '../errors';
import type { AdapterAuthInput, AdapterResult, BaseAdapter, PullResult, RawDeliveryMetric } from '../types';

const BASE_URL = 'https://api.monday.com/v2';

interface MondayMeResponse {
  data?: { me: { name: string } };
  errors?: { message: string }[];
}

interface MondayBoardResponse {
  data?: { boards: { items_page: { cursor: string | null; items: { id: string; state: string }[] } }[] };
  errors?: { message: string }[];
}

export const mondayAdapter: BaseAdapter = {
  provider: 'MONDAY',
  displayName: 'Monday.com',
  dataKind: 'DELIVERY_METRIC',
  configFields: [{ key: 'boardId', label: 'Board ID', placeholder: '1234567890' }],

  async testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>> {
    if (!auth.credential) return { ok: false, ...notConfiguredError('MONDAY') };
    const result = await postJson<MondayMeResponse>(
      'MONDAY',
      BASE_URL,
      { query: 'query { me { name } }' },
      { headers: { Authorization: auth.credential } },
    );
    if (!result.ok) return result;
    if (result.value.body.errors?.length) {
      return { ok: false, ...classifySchemaMismatch('MONDAY', result.value.body.errors[0]!.message) };
    }
    return { ok: true, value: { accountLabel: result.value.body.data!.me.name } };
  },

  async pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>> {
    const { config, credential } = auth;
    if (!credential || !config.boardId) return { ok: false, ...notConfiguredError('MONDAY') };
    const query = cursor
      ? `query { next_items_page(cursor: "${cursor}") { cursor items { id state } } }`
      : `query { boards(ids: [${config.boardId}]) { items_page(limit: 100) { cursor items { id state } } } }`;
    const result = await postJson<MondayBoardResponse>('MONDAY', BASE_URL, { query }, {
      headers: { Authorization: credential },
    });
    if (!result.ok) return result;
    if (result.value.body.errors?.length) {
      return { ok: false, ...classifySchemaMismatch('MONDAY', result.value.body.errors[0]!.message) };
    }
    const page = result.value.body.data!.boards[0]?.items_page;
    const items = page?.items ?? [];
    const closed = items.filter((i) => i.state === 'done' || i.state === 'archived').length;
    const open = items.length - closed;

    const record: RawDeliveryMetric = {
      kind: 'DELIVERY_METRIC',
      externalId: `${config.boardId}:${cursor ?? '0'}`,
      sourceLabel: config.boardId,
      sprintOrPeriod: null,
      velocityPoints: null,
      issuesOpen: open,
      issuesClosed: closed,
      milestoneStatus: open === 0 ? 'ON_TRACK' : 'UNKNOWN',
      observedAt: new Date().toISOString(),
    };
    return {
      ok: true,
      value: {
        records: [record],
        nextCursor: page?.cursor ?? null,
        rateLimitRemaining: result.value.rateLimitRemaining,
        rateLimitResetAt: result.value.rateLimitResetAt,
      },
    };
  },
};
