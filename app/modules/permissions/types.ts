export type Permissions = Record<string, number[]>;

export type EntityWithPermissions = {
	permissions: Permissions;
};

/** Represents a "global" role with permissions associated to it */
export type Role =
	| "ADMIN"
	| "STAFF"
	| "PLUS_SERVER_MEMBER"
	| "VIDEO_ADDER"
	| "ARTIST"
	| "CALENDAR_EVENT_ADDER"
	| "TOURNAMENT_ADDER"
	| "SUPPORTER" // patrons of "Supporter" tier or higher
	| "MINOR_SUPPORT"; // patrons of "Support" tier or higher
