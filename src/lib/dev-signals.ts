/**
 * Local engineering signals for the Ops Console's Platform Pulse — git
 * activity and the last test run, read straight off the working tree.
 *
 * Everything here is a **development / self-hosted** convenience:
 *   • the git reader only runs when NODE_ENV !== 'production' and a `.git`
 *     directory is present, and shells `git` with fixed args (no shell,
 *     no interpolation);
 *   • the test-run reader parses the gitignored `.a2r/vitest-result.json`
 *     that `npm test` writes via the vitest json reporter.
 *
 * Nothing here is tenant data and nothing is exposed outside the
 * staff-gated `/ops` surface. Every function fails soft (returns null).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();

export interface GitCommit {
  sha: string;
  subject: string;
  author: string;
  /** ISO 8601. */
  at: string;
}

export interface GitSignal {
  branch: string;
  commits: GitCommit[];
}

/** Recent commits + current branch, or null when unavailable / in prod. */
export function readGitSignal(limit = 6): GitSignal | null {
  if (process.env.NODE_ENV === 'production') return null;
  if (!existsSync(join(REPO_ROOT, '.git'))) return null;

  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 2000,
    }).trim();

    const raw = execFileSync(
      'git',
      ['log', `-${limit}`, '--no-color', '--date=iso-strict', '--format=%H%x1f%s%x1f%an%x1f%ad'],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 2000 }
    );

    const commits: GitCommit[] = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, subject, author, at] = line.split('\x1f');
        return {
          sha: (sha ?? '').slice(0, 7),
          subject: subject ?? '',
          author: author ?? '',
          at: at ? new Date(at).toISOString() : new Date(0).toISOString(),
        };
      });

    return { branch: branch || 'HEAD', commits };
  } catch {
    return null;
  }
}

export interface TestSignal {
  total: number;
  passed: number;
  failed: number;
  /** true when every test passed. */
  green: boolean;
  /** ISO 8601 — when the run started. */
  at: string;
}

interface VitestJson {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  startTime?: number;
  success?: boolean;
}

/** Parse a vitest json-reporter payload into a TestSignal (exported for tests). */
export function parseTestReport(json: unknown): TestSignal | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as VitestJson;
  const total = Number(r.numTotalTests ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const passed = Number(r.numPassedTests ?? 0);
  const failed = Number(r.numFailedTests ?? 0);
  const at = Number.isFinite(r.startTime) ? new Date(r.startTime as number).toISOString() : new Date().toISOString();
  return {
    total,
    passed,
    failed,
    green: r.success === true || (failed === 0 && passed === total),
    at,
  };
}

/** Last recorded `npm test` result, or null before the first run. */
export function readTestSignal(): TestSignal | null {
  const path = join(REPO_ROOT, '.a2r', 'vitest-result.json');
  if (!existsSync(path)) return null;
  try {
    return parseTestReport(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}
