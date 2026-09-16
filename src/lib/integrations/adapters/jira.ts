/**
 * PS-DOS™ — © 2026 A2R Ventures LLC. All rights reserved.
 *
 * Jira Cloud adapter — read-only sprint velocity, issue counts, and
 * milestone status via the REST API v3 (`/rest/api/3/*`). Auth is Jira
 * Cloud's standard API-token model: Basic auth over `email:token`.
 *
 * `config`: { baseUrl: "https://<site>.atlassian.net", email, projectKey }.
 * `credential`: the API token (never the password).
 */
import { getJson } from '../http';
import { notConfiguredError } from '../errors';
import type { AdapterAuthInput, AdapterResult, BaseAdapter, PullResult, RawDeliveryMetric } from '../types';

interface JiraMyself {
  displayName: string;
}

interface JiraIssue {
  fields: { status: { statusCategory: { key: string } } };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  startAt: number;
  maxResults: number;
}

function authHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

export const jiraAdapter: BaseAdapter = {
  provider: 'JIRA',
  displayName: 'Jira',
  dataKind: 'DELIVERY_METRIC',
  configFields: [
    { key: 'baseUrl', label: 'Site URL', placeholder: 'https://acme.atlassian.net' },
    { key: 'email', label: 'Account email', placeholder: 'integrations@acme.com' },
    { key: 'projectKey', label: 'Project key', placeholder: 'DEL' },
  ],

  async testConnection(auth: AdapterAuthInput): Promise<AdapterResult<{ accountLabel: string }>> {
    const { config, credential } = auth;
    if (!credential || !config.email || !config.baseUrl) return { ok: false, ...notConfiguredError('JIRA') };
    const result = await getJson<JiraMyself>('JIRA', `${config.baseUrl}/rest/api/3/myself`, {
      headers: { Authorization: authHeader(config.email, credential) },
    });
    if (!result.ok) return result;
    return { ok: true, value: { accountLabel: result.value.body.displayName } };
  },

  async pull(auth: AdapterAuthInput, cursor?: string): Promise<AdapterResult<PullResult>> {
    const { config, credential } = auth;
    if (!credential || !config.email || !config.baseUrl || !config.projectKey) {
      return { ok: false, ...notConfiguredError('JIRA') };
    }
    const startAt = cursor ? Number(cursor) || 0 : 0;
    const jql = encodeURIComponent(`project = "${config.projectKey}" ORDER BY updated DESC`);
    const url = `${config.baseUrl}/rest/api/3/search?jql=${jql}&startAt=${startAt}&maxResults=50&fields=status`;
    const result = await getJson<JiraSearchResponse>('JIRA', url, {
      headers: { Authorization: authHeader(config.email, credential) },
    });
    if (!result.ok) return result;

    const { body, rateLimitRemaining, rateLimitResetAt } = result.value;
    let closed = 0;
    for (const issue of body.issues) {
      if (issue.fields.status.statusCategory.key === 'done') closed++;
    }
    const open = body.issues.length - closed;

    const record: RawDeliveryMetric = {
      kind: 'DELIVERY_METRIC',
      externalId: `${config.projectKey}:${startAt}`,
      sourceLabel: config.projectKey,
      sprintOrPeriod: null,
      velocityPoints: null, // requires the Jira Software (Agile) API, not core v3 — a follow-on
      issuesOpen: open,
      issuesClosed: closed,
      milestoneStatus: open === 0 ? 'ON_TRACK' : open > closed ? 'AT_RISK' : 'ON_TRACK',
      observedAt: new Date().toISOString(),
    };

    const nextStart = body.startAt + body.issues.length;
    const nextCursor = nextStart < body.total ? String(nextStart) : null;
    return { ok: true, value: { records: [record], nextCursor, rateLimitRemaining, rateLimitResetAt } };
  },
};
