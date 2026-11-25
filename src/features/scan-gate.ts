/**
 * Decides whether a camera barcode event may start a check-in request.
 *
 * - Only one request may be in flight at a time.
 * - Barcode events arrive many times per second; a short cooldown absorbs them.
 * - After the operator taps "Scan next", the code that was just handled is
 *   usually still in front of the camera. It is ignored for a while so it does
 *   not immediately produce a spurious "already checked in" result.
 */
export interface ScanGateOptions {
  cooldownMs?: number;
  sameCodeMs?: number;
  now?: () => number;
}

export interface ScanGate {
  /** Returns true and marks the gate busy when `payload` may be submitted. */
  tryAcquire(payload: string): boolean;
  /** Explicit operator retry: bypasses the cooldown but never runs concurrently. */
  tryAcquireRetry(): boolean;
  /** Marks the in-flight request as finished. */
  release(): void;
  /** Called when the operator is ready for the next ticket. */
  reset(): void;
  readonly busy: boolean;
}

export function createScanGate({
  cooldownMs = 1500,
  sameCodeMs = 4000,
  now = Date.now,
}: ScanGateOptions = {}): ScanGate {
  let busy = false;
  let lastAcceptedAt = -Infinity;
  let lastPayload: string | null = null;
  let suppressed: { payload: string; until: number } | null = null;

  return {
    tryAcquire(payload: string) {
      const value = payload.trim();
      if (!value || busy) return false;
      const t = now();
      if (t - lastAcceptedAt < cooldownMs) return false;
      if (suppressed && suppressed.payload === value && t < suppressed.until) return false;
      busy = true;
      lastAcceptedAt = t;
      lastPayload = value;
      suppressed = null;
      return true;
    },
    tryAcquireRetry() {
      if (busy) return false;
      busy = true;
      lastAcceptedAt = now();
      return true;
    },
    release() {
      busy = false;
    },
    reset() {
      busy = false;
      const t = now();
      lastAcceptedAt = t;
      suppressed = lastPayload ? { payload: lastPayload, until: t + sameCodeMs } : null;
    },
    get busy() {
      return busy;
    },
  };
}
