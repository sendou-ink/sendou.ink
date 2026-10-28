import type { CircuitEvent } from "./circuit-types";

export const circuitEventAnchorId = (eventId: number) =>
	`circuit-event-${eventId}`;

export const circuitModesLabel = (
	offMode: NonNullable<CircuitEvent["offMode"]>,
) => `SZ × ${offMode}`;
