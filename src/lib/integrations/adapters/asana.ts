/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Asana adapter — read-only task/milestone counts via the REST API
 * (`app.asana.com/api/1.0`). Auth: a Personal Access Token as a Bearer
 * token.
 *
 * `config`: { projectGid }. `credential`: the Personal Access Token.
 */
import { getJson } from '../http';
import { notConfiguredError } from '../errors';
import type { AdapterAuthInput, AdapterResult, BaseAdapter, PullResult, RawDeliveryMetric } from '../types';

const BASE_URL = 'https://app.asana.com/api/1.0';

interface AsanaUser {
  data: { name: string };
}

interface AsanaTask {
  gid: string;
  completed: boolean;
}

interface AsanaTaskList {
  data: AsanaTask[];
  next_page: { offset: string } | null;
}

export const asanaAdapter: BaseAdapter = {
  provider: 'ASANA',
  displayName: 'Asana',
  dataKind: 'DELIVERY_METRIC',
  configFields: [{ key: 'projectGid', label: 'Project GID', placeholder: '1206...' }],

  async testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>> {
    if (!auth.credential) return { ok: false, ...notConfiguredError('ASANA') };
    const result = await getJson<AsanaUser>('ASANA', `${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${auth.credential}` },
    });
    if (!result.ok) return result;
    return { ok: true, value: { accountLabel: result.value.body.data.name } };
  },

  async pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>> {
    const { config, credential } = auth;
    if (!credential || !config.projectGid) return { ok: false, ...notConfiguredError('ASANA') };
    const offsetParam = cursor ? `&offset=${encodeURIComponent(cursor)}` : '';
    const url = `${BASE_URL}/projects/${config.projectGid}/tasks?opt_fields=completed&limit=100${offsetParam}`;
    const result = await getJson<AsanaTaskList>('ASANA', url, {
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!result.ok) return result;

    const { body, rateLimitRemaining, rateLimitResetAt } = result.value;
    const closed = body.data.filter((t) => t.completed).length;
    const open = body.data.length - closed;
    const record: RawDeliveryMetric = {
      kind: 'DELIVERY_METRIC',
      externalId: `${config.projectGid}:${cursor ?? '0'}`,
      sourceLabel: config.projectGid,
      sprintOrPeriod: null,
      velocityPoints: null,
      issuesOpen: open,
      issuesClosed: closed,
      milestoneStatus: open === 0 ? 'ON_TRACK' : 'UNKNOWN',
      observedAt: new Date().toISOString(),
    };
    return {
      ok: true,
      value: { records: [record], nextCursor: body.next_page?.offset ?? null, rateLimitRemaining, rateLimitResetAt },
    };
  },
};
