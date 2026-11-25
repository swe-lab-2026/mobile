import React, { createContext, useContext, useMemo, useState } from 'react';
import { useAuth } from './auth-context';

interface SelectedEventContextValue {
  selectedEventId: string | null;
  selectEvent: (eventId: string | null) => void;
}

const SelectedEventContext = createContext<SelectedEventContextValue | undefined>(undefined);

/**
 * The selection belongs to one account. Keying the state by user id means a
 * logout or an account switch can never carry an event selection over.
 */
export function SelectedEventProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const owner = user?.userId ?? null;
  const [selection, setSelection] = useState<{ owner: string | null; eventId: string | null }>({
    owner: null,
    eventId: null,
  });

  const selectedEventId = selection.owner === owner ? selection.eventId : null;

  const value = useMemo(
    () => ({
      selectedEventId,
      selectEvent: (eventId: string | null) => setSelection({ owner, eventId }),
    }),
    [selectedEventId, owner],
  );

  return <SelectedEventContext.Provider value={value}>{children}</SelectedEventContext.Provider>;
}

export function useSelectedEvent() {
  const ctx = useContext(SelectedEventContext);
  if (!ctx) throw new Error('useSelectedEvent must be used within SelectedEventProvider');
  return ctx;
}
