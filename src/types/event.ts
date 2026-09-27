export interface EventCounters {
    registeredCount: number;
    checkedInCount: number;
}

export interface AssignedEvent {
    id: string;
    name: string;
    startsAt: string;
    location: string;
}

export interface EventDetails extends AssignedEvent, EventCounters {}