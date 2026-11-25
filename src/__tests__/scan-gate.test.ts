import { createScanGate } from '../features/scan-gate';

describe('scan gate', () => {
  let now = 0;
  const gate = () => createScanGate({ cooldownMs: 1500, sameCodeMs: 4000, now: () => now });

  beforeEach(() => {
    now = 10_000;
  });

  it('allows only one request in flight', () => {
    const g = gate();
    expect(g.tryAcquire('A')).toBe(true);
    now += 5000;
    expect(g.tryAcquire('B')).toBe(false);
    g.release();
    expect(g.tryAcquire('B')).toBe(true);
  });

  it('absorbs bursts of barcode events within the cooldown', () => {
    const g = gate();
    expect(g.tryAcquire('A')).toBe(true);
    g.release();
    now += 200;
    expect(g.tryAcquire('B')).toBe(false);
    now += 1500;
    expect(g.tryAcquire('B')).toBe(true);
  });

  it('ignores the same code right after "Scan next" but accepts a new ticket', () => {
    const g = gate();
    g.tryAcquire('A');
    g.release();
    g.reset();
    now += 2000;
    expect(g.tryAcquire('A')).toBe(false); // still in front of the camera
    expect(g.tryAcquire('B')).toBe(true);
  });

  it('accepts the same code again once the suppression window passed', () => {
    const g = gate();
    g.tryAcquire('A');
    g.release();
    g.reset();
    now += 4001;
    expect(g.tryAcquire('A')).toBe(true);
  });

  it('prevents repeated retry taps from creating concurrent requests', () => {
    const g = gate();
    g.tryAcquire('A');
    g.release();
    expect(g.tryAcquireRetry()).toBe(true);
    expect(g.tryAcquireRetry()).toBe(false);
    expect(g.tryAcquire('B')).toBe(false);
    g.release();
    expect(g.tryAcquireRetry()).toBe(true);
  });

  it('ignores empty payloads', () => {
    expect(gate().tryAcquire('   ')).toBe(false);
  });
});
