/**
 * Version & build stamp — for build traceability in the Ops Console.
 *
 * Values come from `NEXT_PUBLIC_*` env vars injected by next.config.mjs at
 * build time (version from package.json; commit SHA + build time from CI
 * when available). No runtime filesystem read, works on client and server.
 * Outside a Next build (unit tests) the version falls back to `0.0.0-dev`.
 */

export interface BuildInfo {
  productName: string;
  /** Semantic version from package.json, e.g. "1.0.0". */
  version: string;
  /** 7-char commit SHA, or null when not built from a repo. */
  commit: string | null;
  /** ISO 8601 build timestamp, or null in local dev. */
  buildTime: string | null;
  /** Discreet footer label: "A2R Delivery OS v1.0.0". */
  versionLabel: string;
  /** Fuller stamp: "v1.0.0 · a1b2c3d · 2026-09-03" (SHA/date omitted when absent). */
  fullStamp: string;
}

const PRODUCT_NAME = 'A2R Delivery OS';

function clean(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : null;
}

export function makeBuildInfo(env: {
  version?: string;
  commit?: string;
  buildTime?: string;
}): BuildInfo {
  const version = clean(env.version) ?? '0.0.0-dev';
  const commit = clean(env.commit);
  const buildTime = clean(env.buildTime);

  const stampParts = [`v${version}`];
  if (commit) stampParts.push(commit);
  if (buildTime && /^\d{4}-\d{2}-\d{2}/.test(buildTime)) stampParts.push(buildTime.slice(0, 10));

  return {
    productName: PRODUCT_NAME,
    version,
    commit,
    buildTime,
    versionLabel: `${PRODUCT_NAME} v${version}`,
    fullStamp: stampParts.join(' · '),
  };
}

export const BUILD_INFO: BuildInfo = makeBuildInfo({
  version: process.env.NEXT_PUBLIC_APP_VERSION,
  commit: process.env.NEXT_PUBLIC_BUILD_SHA,
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME,
});
