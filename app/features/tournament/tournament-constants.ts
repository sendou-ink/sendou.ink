import { TEAM } from "../team/team-constants";

export const TOURNAMENT = {
	TEAM_NAME_MAX_LENGTH: TEAM.NAME_MAX_LENGTH,
	COUNTERPICK_MAPS_PER_MODE: 2,
	COUNTERPICK_MAX_STAGE_REPEAT: 2,
	COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE: 6,
	AVAILABLE_BEST_OF: [1, 3, 5, 7, 9] as const,
	ENOUGH_TEAMS_TO_START: 2,
	MAX_BRACKETS_PER_TOURNAMENT: 10,
	BRACKET_NAME_MAX_LENGTH: 32,
	PLACEMENT_MAX: 100,
	// fallback, normally set by the user explicitly
	RR_DEFAULT_TEAM_COUNT_PER_GROUP: 4,
	RR_TEAMS_PER_GROUP_OPTIONS: [3, 4, 5, 6, 7, 8],
	RR_AB_DIVISIONS_TEAMS_PER_GROUP_OPTIONS: [4, 6, 8, 10, 12],
	SWISS_DEFAULT_GROUP_COUNT: 1,
	SWISS_DEFAULT_ROUND_COUNT: 5,
	SE_DEFAULT_HAS_THIRD_PLACE_MATCH: true,
	MAX_SAVED_COUNT: 20,
	/** How many days after a tournament ends VOD links are shown on the bracket */
	VOD_VISIBILITY_DAYS: 7,
	ROUND_NAMES: {
		WB_FINALS: "WB Finals",
		GRAND_FINALS: "Grand Finals",
		BRACKET_RESET: "Bracket Reset",
		FINALS: "Finals",
		LB_FINALS: "LB Finals",
		LB_SEMIS: "LB Semis",
		THIRD_PLACE_MATCH: "3rd place match",
		FINALS_THIRD_PLACE_MATCH_UNIFIED: "Finals + 3rd place match",
	},
} as const;

export const TOURNAMENT_STAGE_TYPES = [
	"single_elimination",
	"double_elimination",
	"round_robin",
	"swiss",
] as const;

/** AUTO = teams pick map pools ahead and each round's map list is made automatically, TO = the TO picks the maps. */
export type TournamentMapPickingStyle =
	| "TO"
	| "AUTO_ALL"
	| "AUTO_SZ"
	| "AUTO_TC"
	| "AUTO_RM"
	| "AUTO_CB";

export const TOURNAMENT_STAFF_ROLES = ["ORGANIZER", "STREAMER"] as const;

export type TournamentStaffRole = (typeof TOURNAMENT_STAFF_ROLES)[number];

export const TOURNAMENT_AUDIT_LOG_TYPES = [
	"MEMBER_ADDED",
	"MEMBER_REMOVED",
	"TEAM_REGISTERED",
	"TEAM_UNREGISTERED",
	"TEAM_CHECKED_IN",
	"TEAM_CHECKED_OUT",
	"TEAM_DROPPED_OUT",
	"TEAM_DROP_OUT_UNDONE",
	"UPDATE_IN_GAME_NAME",
	"UPDATE_TOURNAMENT_NAME",
] as const;

export type TournamentAuditLogType =
	(typeof TOURNAMENT_AUDIT_LOG_TYPES)[number];
