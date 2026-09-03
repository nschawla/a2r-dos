import { describe, it, expect } from 'vitest';
import { makeBuildInfo } from '../src/lib/build-info';

describe('makeBuildInfo', () => {
  it('builds the labels from a full CI environment', () => {
    const info = makeBuildInfo({ version: '1.2.3', commit: 'a1b2c3d', buildTime: '2026-09-03T10:15:00.000Z' });
    expect(info.version).toBe('1.2.3');
    expect(info.commit).toBe('a1b2c3d');
    expect(info.versionLabel).toBe('A2R Delivery OS v1.2.3');
    expect(info.fullStamp).toBe('v1.2.3 · a1b2c3d · 2026-09-03');
  });

  it('omits the SHA and date when they are absent', () => {
    const info = makeBuildInfo({ version: '1.2.3' });
    expect(info.commit).toBeNull();
    expect(info.buildTime).toBeNull();
    expect(info.fullStamp).toBe('v1.2.3');
  });

  it('falls back to a dev version outside a build', () => {
    const info = makeBuildInfo({});
    expect(info.version).toBe('0.0.0-dev');
    expect(info.versionLabel).toBe('A2R Delivery OS v0.0.0-dev');
  });

  it('ignores blank / malformed values', () => {
    const info = makeBuildInfo({ version: '  ', commit: '   ', buildTime: 'not-a-date' });
    expect(info.version).toBe('0.0.0-dev');
    expect(info.commit).toBeNull();
    expect(info.fullStamp).toBe('v0.0.0-dev'); // malformed buildTime not appended
  });
});
