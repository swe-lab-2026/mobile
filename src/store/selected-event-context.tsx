import React, { createContext, useContext, useMemo, useState } from 'react';

interface SelectedEventContextValue {
  selectedEventId: string | null;
  selectEvent: (eventId: string | null) => void;
}

const SelectedEventContext = createContext<SelectedEventContextValue | undefined>(undefined);

export function SelectedEventProvider({ children }: { children: React.ReactNode }) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const value = useMemo(
    () => ({ selectedEventId, selectEvent: setSelectedEventId }),
    [selectedEventId]
  );

  return <SelectedEventContext.Provider value={value}>{children}</SelectedEventContext.Provider>;
}

export function useSelectedEvent() {
  const ctx = useContext(SelectedEventContext);
  if (!ctx) throw new Error('useSelectedEvent must be used within SelectedEventProvider');
  return ctx;
}
