import { useCallback, useRef, useState } from 'react';
import { getEventAttendanceStats } from '../api/events';
import type { AttendanceStats } from '../types/event';

interface StatsSnapshot {
  eventId: string;
  data: AttendanceStats;
  updatedAt: number;
}

export interface AttendanceStatsState {
  /** Last stats received from GET /events/{id}/tickets/stats, or null. */
  stats: AttendanceStats | null;
  updatedAt: number | null;
  loading: boolean;
  /** The latest refresh failed. */
  failed: boolean;
  /** Stats are shown but the latest refresh failed, so they may be outdated. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Attendance counters come only from the backend stats endpoint: they are
 * never derived from a (partial, filtered) ticket list. Out-of-order responses
 * are dropped, and a failed refresh keeps the last values but flags them stale.
 */
export function useAttendanceStats(eventId: string | null | undefined): AttendanceStatsState {
  const [snapshot, setSnapshot] = useState<StatsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const gen = ++generation.current;
    setLoading(true);
    try {
      const data = await getEventAttendanceStats(eventId);
      if (gen !== generation.current) return;
      setSnapshot({ eventId, data, updatedAt: Date.now() });
      setFailedFor(null);
    } catch {
      if (gen !== generation.current) return;
      setFailedFor(eventId);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [eventId]);

  const current = snapshot && snapshot.eventId === eventId ? snapshot : null;
  const failed = !!eventId && failedFor === eventId;

  return {
    stats: current?.data ?? null,
    updatedAt: current?.updatedAt ?? null,
    loading,
    failed,
    stale: failed && !!current,
    refresh,
  };
}
