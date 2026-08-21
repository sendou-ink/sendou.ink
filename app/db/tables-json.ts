/**
 * Shapes of JSON column payloads that have no natural feature home. Kept apart from
 * `tables.ts` so that what is declared there stays close to the `DB` interface. Payloads
 * that do belong to a feature (e.g. `StoredWidget`, `Notification`) live with that feature
 * and are imported by `tables.ts` directly.
 */

import type { DBBoolean } from "~/db/tables";
import type { CalendarFilters } from "~/features/calendar/calendar-types";
import type { ScrimFilters } from "~/features/scrims/scrims-types";
import type { CustomThemeVar } from "~/features/theme/theme-constants";
import type * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type * as Progression from "~/features/tournament-bracket/core/Progression";
import type {
	ActionType,
	WhoSide,
} from "~/features/tournament-bracket/tournament-bracket-constants";
import type {
	ObjectPronoun,
	SubjectPronoun,
} from "~/features/user-page/user-page-constants";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";

export type CustomTheme = Omit<Record<CustomThemeVar, number>, "--_chat-h"> & {
	"--_chat-h": number | null;
};

// missing means "neutral"
export type Preference = "AVOID" | "PREFER";

export interface UserMapModePreferences {
	modes: Array<{
		mode: ModeShort;
		/** Users opinion on the mode, `undefined` means neutral */
		preference?: Preference;
	}>;
	pool: Array<{
		mode: ModeShort;
		stages: StageId[];
	}>;
}

export interface WeaponPoolEntry {
	weaponSplId: MainWeaponId;
	isFavorite: DBBoolean;
}

export interface UserPreferences {
	disableBuildAbilitySorting?: boolean;
	disallowScrimPickupsFromUntrusted?: boolean;
	defaultCalendarFilters?: CalendarFilters;
	defaultScrimsFilters?: ScrimFilters;
	/**
	 * What time format the user prefers?
	 *
	 * "auto" = use browser default (default value)
	 * "24h" = 24 hour format (e.g. 14:00)
	 * "12h" = 12 hour format (e.g. 2:00 PM)
	 * */
	clockFormat?: "24h" | "12h" | "auto";
	/** Is the new widget based user page enabled? (Supporter early preview) */
	newProfileEnabled?: boolean;
	/** Is spoiler-free mode enabled? Hides recent tournament results and scores until the user chooses to reveal them. */
	spoilerFreeMode?: boolean;
	weaponReportDefaultOpen?: boolean;
}

export type Pronouns = {
	subject: SubjectPronoun;
	object: ObjectPronoun;
};

export interface PeakXP {
	/** Peak XP across all divisions */
	overall: number;
	/** Peak XP (Takoroka division) */
	takoroka: number | null;
	/** Peak XP (Tentatek division) */
	tentatek: number | null;
}

export interface TournamentSettings {
	bracketProgression: Progression.ParsedBracket[];
	/** @deprecated use bracketProgression instead */
	teamsPerGroup?: number;
	/** @deprecated use bracketProgression instead */
	thirdPlaceMatch?: boolean;
	isRanked?: boolean;
	enableNoScreenToggle?: boolean;
	/** Enable the subs tab, default true */
	enableSubs?: boolean;
	requireInGameNames?: boolean;
	isInvitational?: boolean;
	/** Can teams add subs on their own while tournament is in progress? */
	autonomousSubs?: boolean;
	/** Timestamp (SQLite format) when reg closes, if missing then means closes at start time */
	regClosesAt?: number;
	/** @deprecated use bracketProgression instead */
	swiss?: {
		groupCount: number;
		roundCount: number;
	};
	minMembersPerTeam?: number;
	/** Maximum number of team members that can be registered (only applies to 4v4 tournaments) */
	maxMembersPerTeam?: number;
	isTest?: boolean;
	isDraft?: boolean;
	requireSendouQParticipation?: boolean;
	/** Is this tournament a league? Leagues are played over many weeks, each starting bracket being a division. */
	isLeague?: boolean;
}

export interface CastedMatchesInfo {
	/** Array for matches that are locked because they are pending to be casted */
	lockedMatches: Array<{ twitchAccount: string; matchId: number }>;
	/** What matches are streamed currently & where */
	castedMatches: { twitchAccount: string; matchId: number }[];
	castedMatchHistory?: Array<{
		twitchAccount: string;
		matchId: number;
		timestamp: number;
	}>;
}

export interface SeedingSnapshot {
	savedAt: number;
	teams: Array<{
		teamId: number;
		members: Array<{ userId: number; username: string }>;
	}>;
}

export interface PreparedMaps {
	authorId: number;
	createdAt: number;
	maps: Array<TournamentRoundMaps & { roundId: number; groupId: number }>;
	eliminationTeamCount?: number;
}

export interface TournamentRoundMaps {
	list?: Array<{ mode: ModeShort; stageId: StageId }> | null;
	count: number;
	type: "BEST_OF" | "PLAY_ALL";
	pickBan?: PickBan.Type | null;
	customFlow?: CustomPickBanFlow | null;
}

export interface CustomPickBanStep {
	action: ActionType;
	side?: WhoSide;
}

export interface CustomPickBanFlow {
	preSet: CustomPickBanStep[];
	postGame: CustomPickBanStep[];
}

// when updating this also update `settingsFromFormValues` in calendar-progression-form.ts
export interface TournamentStageSettings {
	// SE
	thirdPlaceMatch?: boolean;
	// RR
	teamsPerGroup?: number;
	/** (RR only) When true, teams are split into A and B divisions and matches only pair A-vs-B. Only valid on starting brackets. */
	hasAbDivisions?: boolean;
	// SWISS
	groupCount?: number;
	// SWISS
	roundCount?: number;
	/** (Swiss only) Number of wins required for a team to advance early. When set, teams advance at this win count and are eliminated at (roundCount - advanceThreshold + 1) losses. */
	advanceThreshold?: number;
}

export interface TournamentAuditLogMetadata {
	bracketIdx?: number;
	/** The new in-game name, for `UPDATE_IN_GAME_NAME` events. */
	inGameName?: string;
	/** The new tournament name, for `UPDATE_TOURNAMENT_NAME` events. `null` = it was cleared. */
	tournamentName?: string | null;
}

/**
 * The result of sets in the tournament.
 * E.g. ["W", "L", null] would mean the user won the first set, lost the second and did not play the third.
 * */
export type WinLossParticipationArray = Array<"W" | "L" | null>;

export interface NotificationSubscription {
	endpoint: string;
	keys: {
		auth: string;
		p256dh: string;
	};
}
