export const LOBBY_LABELS = ["CASUAL", "FOCUSED", "TRYHARD"] as const;
export type LobbyLabel = (typeof LOBBY_LABELS)[number];

export const LOBBY_BEST_OFS = [1, 3, 5, 7, 9] as const;
export type LobbyBestOf = (typeof LOBBY_BEST_OFS)[number];

export const LOBBY_INDEX_TABS = ["running", "upcoming", "ended"] as const;
export type LobbyIndexTab = (typeof LOBBY_INDEX_TABS)[number];

export const LOBBY_ROOM_SIZES = [8, 9, 10] as const;
export type LobbyRoomSize = (typeof LOBBY_ROOM_SIZES)[number];

/** Players needed for a set, 4v4 */
export const PLAYERS_PER_SET = 8;
export const PLAYERS_PER_TEAM = 4;

export const LOBBY_NAME_MAX_LENGTH = 50;

/** How long before the start check-in opens */
export const CHECK_IN_LEAD_MINUTES = 10;

/** How long the waitlist has priority (by queue order) on a vacant slot before it's first come, first served */
export const SLOT_FILL_PRIORITY_MINUTES = 3;

/** An active lobby with no map reported, or a pending one after its start, closes after this long */
export const AUTO_CLOSE_MINUTES = 120;

/** How long the lobby chat rooms stay open after the lobby's start time */
export const CHAT_ROOM_LIFESPAN_HOURS = 24;

export const LOBBY_SIDES = ["ALPHA", "BRAVO"] as const;
export type LobbySide = (typeof LOBBY_SIDES)[number];

/** Value the sides of a lobby game stand in for a team id with, e.g. in ingested scoreboards. */
export const LOBBY_SIDE_TEAM_ID = {
	ALPHA: 1,
	BRAVO: 2,
} as const satisfies Record<LobbySide, number>;

/**
 * - `REGISTERED`: has a spot (within the room size), not checked in
 * - `WAITLISTED`: past the room size, or after the start not present in the room
 * - `CHECKED_IN`: present and waiting for a spot in the room
 * - `IN_ROOM`: playing or spectating in the room
 */
export type LobbyParticipantStatus =
	| "REGISTERED"
	| "WAITLISTED"
	| "CHECKED_IN"
	| "IN_ROOM";
