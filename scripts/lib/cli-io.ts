/**
 * A2R — shared helpers for the direct-DB operational CLIs
 * (scripts/reset-password.ts, scripts/create-operator.ts, scripts/ops-mfa.ts).
 *
 *   - masked / interactive secret input, so passwords never appear as
 *     command-line arguments (visible in `ps`, shell history, process logs)
 *   - `--password-stdin` for automation
 *   - a typed production-write confirmation, defaulting AWAY from an
 *     accidental prod mutation
 */
import { randomBytes } from 'node:crypto';
import { DEFAULT_PRODUCTION_SUPABASE_REF } from '../../src/lib/config/env-isolation-core.mjs';

const PROD_REF = (process.env.PRODUCTION_SUPABASE_PROJECT_REF || DEFAULT_PRODUCTION_SUPABASE_REF).trim().toLowerCase();
const PROD_HOST = (process.env.PRODUCTION_DB_HOST || '').trim().toLowerCase();

const CH_CTRL_C = String.fromCharCode(3);
const CH_BACKSPACE = String.fromCharCode(8);
const CH_DEL = String.fromCharCode(127);

export function isProductionDbUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return (PROD_REF.length > 0 && u.includes(PROD_REF)) || (PROD_HOST.length > 0 && u.includes(PROD_HOST));
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Read one line from stdin without echoing keystrokes (TTY) or, when stdin
 * is not a TTY, read the first line as-is (pipe / `--password-stdin`). */
export function promptSecret(question: string): Promise<string> {
  const stdin = process.stdin;

  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.resume();
      const onData = (chunk: string) => {
        buf += chunk;
        const nl = buf.indexOf('\n');
        if (nl !== -1) {
          stdin.removeListener('data', onData);
          stdin.pause();
          resolve(buf.slice(0, nl).replace(/\r$/, ''));
        }
      };
      stdin.on('data', onData);
      stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')));
    });
  }

  process.stdout.write(question);
  return new Promise((resolve, reject) => {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const finish = (fn: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      fn();
    };
    const onData = (key: string) => {
      if (key === '\r' || key === '\n') return finish(() => resolve(buf));
      if (key === CH_CTRL_C) return finish(() => reject(new Error('cancelled')));
      if (key === CH_BACKSPACE || key === CH_DEL) {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      // printable chars only — ignore arrows and other escape sequences
      if (key >= ' ' && key !== CH_DEL) {
        buf += key;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

/** A plain (echoed) line prompt — used for the production confirmation. */
export function promptLine(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setEncoding('utf8');
    stdin.resume();
    let buf = '';
    const onData = (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl !== -1) {
        stdin.removeListener('data', onData);
        stdin.pause();
        resolve(buf.slice(0, nl).replace(/\r$/, '').trim());
      }
    };
    stdin.on('data', onData);
  });
}

/** A 20-char temporary password that always satisfies the strength policy
 * (>= 12 chars, lower + upper + digit). */
export function generatePassword(): string {
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[randomBytes(1)[0]! % set.length]).join('');
  return (pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 4) + pick('abcdefghijkmnpqrstuvwxyz', 10) + pick('23456789', 4) + '-')
    .split('')
    .sort(() => (randomBytes(1)[0]! < 128 ? -1 : 1))
    .join('');
}

/**
 * Resolve a password for a write CLI without ever accepting it as a
 * command-line argument:
 *   --password-stdin   -> read one line from stdin
 *   --generate         -> generate a strong temporary one
 *   otherwise          -> masked interactive prompt; an empty entry generates
 */
export async function resolvePassword(): Promise<{ password: string; generated: boolean }> {
  if (hasFlag('generate')) return { password: generatePassword(), generated: true };

  if (hasFlag('password-stdin')) {
    const fromStdin = (await promptSecret('')).trim();
    if (!fromStdin) throw new Error('--password-stdin: no password received on stdin');
    return { password: fromStdin, generated: false };
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      'No TTY for an interactive password prompt. Use --password-stdin (pipe the password) or --generate.',
    );
  }

  const entered = await promptSecret('New password (leave blank to generate a temporary one): ');
  if (!entered) {
    console.log('  -> generating a temporary password (shown below).');
    return { password: generatePassword(), generated: true };
  }
  const again = await promptSecret('Confirm password: ');
  if (again !== entered) throw new Error('passwords did not match');
  return { password: entered, generated: false };
}

/**
 * Guard a mutating CLI against an accidental production run. When the
 * resolved database URL points at production the caller must either pass
 * `--yes-prod` or type the project ref at the prompt. A non-TTY run without
 * the flag is refused.
 */
export async function assertProdWriteAllowed(dbUrl: string | undefined, action: string): Promise<void> {
  if (!isProductionDbUrl(dbUrl)) return;

  if (hasFlag('yes-prod') || /^(1|true|yes|on)$/i.test(process.env.A2R_ALLOW_PROD_WRITE ?? '')) {
    console.error(`\n!  Running against PRODUCTION (${PROD_REF}) - ${action}. (--yes-prod / A2R_ALLOW_PROD_WRITE)\n`);
    return;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      `Refusing to ${action} against PRODUCTION from a non-interactive shell. ` +
        'Re-run with --yes-prod if this is deliberate.',
    );
  }
  console.error(`\n!  This will ${action} on the PRODUCTION database (project ${PROD_REF}).`);
  const typed = await promptLine('   Type the project ref to continue, or anything else to abort: ');
  if (typed !== PROD_REF) throw new Error('production write not confirmed - aborted');
  console.error('');
}
