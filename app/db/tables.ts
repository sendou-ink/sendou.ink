import type {
	ColumnType,
	GeneratedAlways,
	Insertable,
	JSONColumnType,
	Selectable,
} from "kysely";
import type { AssociationVisibility } from "~/features/associations/associations-types";
import type { tags } from "~/features/calendar/calendar-constants";
import type { CalendarFilters } from "~/features/calendar/calendar-types";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import type { Notification as NotificationValue } from "~/features/notifications/notifications-types";
import type { ScrimFilters } from "~/features/scrims/scrims-types";
import type { TEAM_MEMBER_ROLES } from "~/features/team/team-constants";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import type {
	ParticipantResult,
	StageSettings,
} from "~/features/tournament-bracket/core/engine/types";
import type * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type * as Progression from "~/features/tournament-bracket/core/Progression";
import type { StoredWidget } from "~/features/user-page/core/widgets/types";
import type {
	Ability,
	BuildAbilitiesTuple,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { JSONColumnTypeNullable } from "~/utils/kysely.server";

type Generated<T> =
	T extends ColumnType<infer S, infer I, infer U>
		? ColumnType<S, I | undefined, U>
		: ColumnType<T, T | undefined, T>;

export type MemberRole = (typeof TEAM_MEMBER_ROLES)[number];

export type MemberRoleType = "PLAYER" | "OTHER";

/** In SQLite booleans are presented as 0 (false) and 1 (true) */
export type DBBoolean = number;

export const CUSTOM_THEME_VARS = [
	"--_base-h",
	"--_base-c-0",
	"--_base-c-1",
	"--_base-c-2",
	"--_base-c-3",
	"--_base-c-4",
	"--_base-c-5",
	"--_base-c-6",
	"--_base-c-7",
	"--_acc-h",
	"--_acc-c-0",
	"--_acc-c-1",
	"--_acc-c-2",
	"--_acc-c-3",
	"--_acc-c-4",
	"--_acc-c-5",
	"--_second-h",
	"--_second-c-0",
	"--_second-c-1",
	"--_second-c-2",
	"--_second-c-3",
	"--_second-c-4",
	"--_second-c-5",
	"--_chat-h",
	"--_radius-box",
	"--_radius-field",
	"--_radius-selector",
	"--_border-width",
	"--_size-field",
	"--_size-selector",
	"--_size-spacing",
] as const;
export type CustomThemeVar = (typeof CUSTOM_THEME_VARS)[number];
export type CustomTheme = Omit<Record<CustomThemeVar, number>, "--_chat-h"> & {
	"--_chat-h": number | null;
};

export interface Team {
	avatarImgId: number | null;
	bannerImgId: number | null;
	bio: string | null;
	createdAt: Generated<number>;
	customUrl: string;
	customTheme: JSONColumnTypeNullable<CustomTheme>;
	deletedAt: number | null;
	id: GeneratedAlways<number>;
	inviteCode: string;
	name: string;
	bsky: string | null;
	mapModePreferences: JSONColumnTypeNullable<UserMapModePreferences>;
	/** Team's tag, typically used in-game in front of users' names to indicate they are a member of the team. */
	tag: string | null;
}

export interface TeamMember {
	createdAt: Generated<number>;
	isOwner: Generated<number>;
	isManager: Generated<number>;
	leftAt: number | null;
	role: MemberRole | null;
	customRole: string | null;
	/** If customRole is defined, this classifies how the role should be treated */
	roleType: MemberRoleType | null;
	/** User-defined ordering of members within a team (ascending) */
	order: Generated<number>;
	teamId: number;
	userId: number;
	isMainTeam: DBBoolean;
}

export interface Art {
	authorId: number;
	createdAt: Generated<number>;
	description: string | null;
	id: GeneratedAlways<number>;
	imgId: number;
	isShowcase: Generated<DBBoolean>;
}

export interface ArtTag {
	authorId: number;
	createdAt: Generated<number>;
	id: GeneratedAlways<number>;
	name: string;
}

export interface ArtUserMetadata {
	artId: number;
	userId: number;
}

export interface TaggedArt {
	artId: number;
	tagId: number;
}

export interface Badge {
	id: GeneratedAlways<number>;
	code: string;
	displayName: string;
	hue: number | null;
	/** Who made the badge? If null, a legacy badge. */
	authorId: number | null;
}

export interface BadgeManager {
	badgeId: number;
	userId: number;
}

export type BadgeOwner = {
	badgeId: number;
	userId: number;
	count: number;
};

export interface Build {
	clothesGearSplId: number | null;
	description: string | null;
	headGearSplId: number | null;
	id: GeneratedAlways<number>;
	modes: JSONColumnTypeNullable<ModeShort[]>;
	ownerId: number;
	private: DBBoolean | null;
	shoesGearSplId: number | null;
	title: string;
	updatedAt: Generated<number>;
	/** 3x4 ability tuple (head/clothes/shoes × main + 3 subs). */
	abilities: JSONColumnTypeNullable<BuildAbilitiesTuple>;
	/** Serialized ability+AP combo (e.g. `SSU_30,ISS_10`) used to group identical builds for the popular builds view. */
	abilitiesSignature: string | null;
}

export type GearType = "HEAD" | "CLOTHES" | "SHOES";

export interface BuildWeapon {
	buildId: number;
	weaponSplId: MainWeaponId;
	/** Alt skins collapse to their base weapon (e.g. Hero Shot Replica `45` → Splattershot `40`). Indexed for the builds-by-weapon, popular, and stats queries so they can filter `= ?` against a covering index instead of `IN (alt skins…)`. */
	canonicalWeaponSplId: MainWeaponId;
	/** Mirror of `Build.updatedAt`. Denormalized so the `(canonicalWeaponSplId, sortValue, updatedAt, buildId)` covering index serves the builds-by-weapon list. */
	updatedAt: Generated<number>;
	/** Per-weapon sort priority: `plusTier * 2 + (this weapon is top500 ? 0 : 1)` for public builds, NULL for private. */
	sortValue: number | null;
}

/** Per-build ability point sums across all gear slots. Used to compute global `abilityPointAverages`. */
export interface BuildAbilitySum {
	buildId: number;
	ability: Ability;
	abilityPoints: number;
}

/** Per-weapon, per-build ability point sums. Used to compute per-weapon `abilityPointAverages`. One row per canonical weapon × build × ability with non-zero AP. */
export interface BuildWeaponAbility {
	canonicalWeaponSplId: MainWeaponId;
	buildId: number;
	ability: Ability;
	abilityPoints: number;
}

export type CalendarEventTag = keyof typeof tags;

export interface CalendarEvent {
	authorId: number;
	bracketUrl: string;
	description: string | null;
	discordInviteCode: string | null;
	id: GeneratedAlways<number>;
	discordUrl: GeneratedAlways<string | null>;
	name: string;
	participantCount: number | null;
	tags: string | null;
	hidden: Generated<DBBoolean>;
	tournamentId: number | null;
	organizationId: number | null;
	avatarImgId: number | null;
}

export interface CalendarEventBadge {
	badgeId: number;
	eventId: number;
}

export interface CalendarEventDate {
	eventId: number;
	id: GeneratedAlways<number>;
	startTime: number;
}

export interface CalendarEventResultPlayer {
	name: string | null;
	teamId: number;
	userId: number | null;
}

export interface CalendarEventResultTeam {
	eventId: number;
	id: GeneratedAlways<number>;
	name: string;
	placement: number;
}

export interface Group {
	chatCode: string | null;
	createdAt: Generated<number>;
	id: GeneratedAlways<number>;
	inviteCode: string;
	latestActionAt: Generated<number>;
	/** If truthy, group was at least partly made in the matchmaking UI (/q/looking) */
	matchmade: Generated<DBBoolean>;
	status: "PREPARING" | "ACTIVE" | "INACTIVE";
	teamId: number | null;
}

export interface GroupLike {
	createdAt: Generated<number>;
	likerGroupId: number;
	targetGroupId: number;
	isRechallenge: DBBoolean | null;
}

type CalculatingSkill = {
	calculated: false;
	matchesCount: number;
	matchesCountNeeded: number;
	/** Freshly calculated skill */
	newSp?: number;
};
export type UserSkillDifference =
	| {
			calculated: true;
			spDiff: number;
			oldSp?: number;
			newSp?: number;
	  }
	| CalculatingSkill;
export type GroupSkillDifference =
	| {
			calculated: true;
			oldSp: number;
			newSp: number;
	  }
	| CalculatingSkill;

export type ParsedMemento = {
	users: Record<
		number,
		{
			skill?: TieredSkill | "CALCULATING";
			skillDifference?: UserSkillDifference;
		}
	>;
	groups: Record<
		number,
		{
			tier?: TieredSkill["tier"];
			skillDifference?: GroupSkillDifference;
		}
	>;
	modePreferences?: Partial<
		Record<ModeShort, Array<{ userId: number; preference?: Preference }>>
	>;
	/** mapPreferences of season 2 */
	mapPreferences?: Array<{ userId: number; preference?: Preference }[]>;
	pools: Array<{
		userId: number;
		pool: UserMapModePreferences["pool"];
		teamName?: string;
	}>;
};

export interface GroupMatch {
	alphaGroupId: number;
	bravoGroupId: number;
	chatCode: string | null;
	confirmedAt: number | null;
	confirmedByUserId: number | null;
	createdAt: Generated<number>;
	id: GeneratedAlways<number>;
	memento: JSONColumnTypeNullable<ParsedMemento>;
	cancelRequestedByUserId: number | null;
	cancelAcceptedByUserId: number | null;
}

export interface GroupMatchContinueVote {
	id: GeneratedAlways<number>;
	groupId: number;
	userId: number;
	isContinuing: DBBoolean;
	votedAt: Generated<number>;
}

export interface GroupMatchMap {
	id: GeneratedAlways<number>;
	index: number;
	matchId: number;
	mode: ModeShort;
	reportedAt: number | null;
	reportedByUserId: number | null;
	source: string;
	stageId: StageId;
	winnerGroupId: number | null;
}

export interface GroupMember {
	createdAt: Generated<number>;
	groupId: number;
	note: string | null;
	role: "OWNER" | "MANAGER" | "REGULAR";
	userId: number;
}

export interface PrivateUserNote {
	authorId: number;
	targetId: number;
	text: string | null;
	sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
	updatedAt: Generated<number>;
}

/** Log-in links generated via the Lohi Discord bot commands. */
export interface LogInLink {
	code: string;
	expiresAt: number;
	userId: number;
}

export type LFGType =
	| "PLAYER_FOR_TEAM"
	| "PLAYER_FOR_COACH"
	| "TEAM_FOR_PLAYER"
	| "TEAM_FOR_COACH"
	| "TEAM_FOR_SCRIM"
	| "COACH_FOR_TEAM";

export const LFG_TYPES = [
	"PLAYER_FOR_TEAM",
	"PLAYER_FOR_COACH",
	"TEAM_FOR_PLAYER",
	"TEAM_FOR_COACH",
	"TEAM_FOR_SCRIM",
	"COACH_FOR_TEAM",
] as const;

export interface LFGPost {
	id: GeneratedAlways<number>;
	type: LFGType;
	text: string;
	/** e.g. Europe/Helsinki */
	timezone: string;
	authorId: number;
	teamId: number | null;
	plusTierVisibility: number | null;
	languages: string | null;
	updatedAt: Generated<number>;
	createdAt: GeneratedAlways<number>;
}

export interface MapPoolMap {
	calendarEventId: number | null;
	mode: ModeShort;
	stageId: StageId;
	tieBreakerCalendarEventId: number | null;
	tournamentTeamId: number | null;
}

export interface MapResult {
	losses: number;
	mode: ModeShort;
	season: number;
	stageId: StageId;
	userId: number;
	wins: number;
}

export interface PlayerResult {
	mapLosses: number;
	mapWins: number;
	otherUserId: number;
	ownerUserId: number;
	season: number;
	setLosses: number;
	setWins: number;
	type: string;
}

export interface PlusSuggestion {
	authorId: number;
	createdAt: GeneratedAlways<number>;
	id: GeneratedAlways<number>;
	month: number;
	suggestedId: number;
	text: string;
	tier: number;
	updatedAt: number | null;
	year: number;
}

export interface PlusTier {
	tier: number;
	userId: number;
}

export interface PlusVote {
	authorId: number;
	month: number;
	score: number;
	tier: number;
	validAfter: number;
	votedId: number;
	year: number;
}

export interface PlusVotingResult {
	votedId: number;
	tier: number;
	score: number;
	month: number;
	year: number;
	wasSuggested: DBBoolean;
}

export interface ReportedWeapon {
	groupMatchId: number | null;
	tournamentMatchId: number | null;
	mapIndex: number;
	userId: number;
	weaponSplId: MainWeaponId;
	createdAt: Generated<number>;
}

export interface Skill {
	groupMatchId: number | null;
	id: GeneratedAlways<number>;
	identifier: string | null;
	matchesCount: number;
	mu: number;
	ordinal: number;
	sigma: number;
	season: number;
	tournamentId: number | null;
	userId: number | null;
	createdAt: number | null;
}

export interface SkillTeamUser {
	skillId: number;
	userId: number;
}

/** Used for tournament auto-seeding. Calculates off tournament matches same as SP but does not have seasonal resets. */
export interface SeedingSkill {
	mu: number;
	ordinal: number;
	sigma: number;
	userId: number;
	type: "RANKED" | "UNRANKED";
}

export interface PeakXP {
	/** Peak XP across all divisions */
	overall: number;
	/** Peak XP (Takoroka division) */
	takoroka: number | null;
	/** Peak XP (Tentatek division) */
	tentatek: number | null;
}

export interface SplatoonPlayer {
	id: GeneratedAlways<number>;
	splId: string;
	userId: number | null;
	/** Players best XP across both divisions. Denormalized for performance. */
	peakXp: JSONColumnTypeNullable<PeakXP>;
}

export interface TaggedArt {
	artId: number;
	tagId: number;
}

// AUTO = style where teams pick their map pool ahead of time and the map lists are automatically made for each round
// could also have the traditional style where TO picks the maps later
type TournamentMapPickingStyle =
	| "TO"
	| "AUTO_ALL"
	| "AUTO_SZ"
	| "AUTO_TC"
	| "AUTO_RM"
	| "AUTO_CB";

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

export interface Tournament {
	settings: JSONColumnType<TournamentSettings>;
	id: GeneratedAlways<number>;
	mapPickingStyle: TournamentMapPickingStyle;
	/** Maps prepared ahead of time for rounds. Follows settings.bracketProgression order. Null in the spot if not defined yet for that bracket. */
	preparedMaps: JSONColumnTypeNullable<(PreparedMaps | null)[]>;
	castTwitchAccounts: JSONColumnTypeNullable<string[]>;
	castedMatchesInfo: JSONColumnTypeNullable<CastedMatchesInfo>;
	rules: string | null;
	/** Related "parent tournament", the tournament that contains the original sign-ups (for leagues) */
	parentTournamentId: number | null;
	/** Is the tournament finalized meaning all the matches are played and TO has locked it making it read-only */
	isFinalized: Generated<DBBoolean>;
	/** Snapshot of teams and rosters when seeds were last saved. Used to detect NEW teams/players. */
	seedingSnapshot: JSONColumnTypeNullable<SeedingSnapshot>;
	/** Tournament tier based on top teams' skill. 1=X, 2=S+, 3=S, 4=A+, 5=A, 6=B+, 7=B, 8=C+, 9=C */
	tier: TournamentTierNumber | null;
	vodsLastSyncAt: Generated<number | null>;
	/** How many times vods have been synced (automatic process that happens when tournament has concluded). */
	vodsSyncCount: Generated<number>;
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

export interface SavedCalendarEvent {
	id: GeneratedAlways<number>;
	userId: number;
	calendarEventId: number;
	createdAt: Generated<number>;
}

export interface TournamentBadgeOwner {
	badgeId: number;
	userId: number;
	/** Which tournament the badge is from, if null was added manually by a badge manager as opposed to once a tournament was finalized. */
	tournamentId: number | null;
	/** How many times this badge was awarded to this user from this source. Tournament rows are always 1; manual grants aggregate repeat awards here. */
	count: Generated<number>;
}

/** A group is a logical structure used to group multiple rounds together.

- In round-robin stages, a group is a pool.
- In swiss, a group is also a pool (can have one or multiple groups)
- In elimination stages, a group is a bracket.
    - A single elimination stage can have one or two groups:
      - The unique bracket.
      - If enabled, the Consolation Final.
    - A double elimination stage can have two or three groups:
      - Upper and lower brackets.
      - If enabled, the Grand Final.
*/
export interface TournamentGroup {
	id: GeneratedAlways<number>;
	number: number;
	stageId: number;
}

export const TournamentMatchStatus = {
	/** The two matches leading to this one are not completed yet. */
	Locked: 0,

	/** One participant is ready and waiting for the other one. */
	Waiting: 1,

	/** Both participants are ready to start. */
	Ready: 2,

	/** The match is running. */
	Running: 3,

	/** The match is completed. */
	Completed: 4,
};

export interface TournamentMatch {
	chatCode: string | null;
	groupId: number;
	id: GeneratedAlways<number>;
	number: number;
	opponentOne: JSONColumnTypeNullable<ParticipantResult>;
	opponentTwo: JSONColumnTypeNullable<ParticipantResult>;
	roundId: number;
	stageId: number;
	status: (typeof TournamentMatchStatus)[keyof typeof TournamentMatchStatus];
	// set when match becomes ongoing (both teams ready and no earlier matches for either team)
	// for swiss: set at creation time
	startedAt: number | null;
}

/** Represents one decision, pick or ban, during tournaments pick/ban (counterpick, ban 2) phase. */
export interface TournamentMatchPickBanEvent {
	type: "PICK" | "BAN" | "ROLL" | "MODE_PICK" | "MODE_BAN";
	stageId: StageId | null;
	mode: ModeShort | null;
	matchId: number;
	authorId: number | null;
	number: number;
	createdAt: GeneratedAlways<number>;
}

export interface TournamentMatchGameResult {
	createdAt: Generated<number>;
	id: GeneratedAlways<number>;
	matchId: number;
	mode: ModeShort;
	number: number;
	reporterId: number;
	source: string;
	stageId: StageId;
	winnerTeamId: number;
	opponentOnePoints: number | null;
	opponentTwoPoints: number | null;
}

export interface TournamentMatchGameResultParticipant {
	matchGameResultId: number;
	userId: number;
	tournamentTeamId: number;
}

export type WinLossParticipationArray = Array<"W" | "L" | null>;

export interface TournamentResult {
	isHighlight: Generated<DBBoolean>;
	participantCount: number;
	placement: number;
	tournamentId: number;
	tournamentTeamId: number;
	/**
	 * The result of sets in the tournament.
	 * E.g. ["W", "L", null] would mean the user won the first set, lost the second and did not play the third.
	 * */
	setResults: JSONColumnType<WinLossParticipationArray>;
	/** The SP change in total after the finalization of a ranked tournament. */
	spDiff: number | null;
	userId: number;
	/** Division label for tournaments with multiple starting brackets (e.g., "D1", "D2") */
	div: string | null;
}

export interface TournamentRoundMaps {
	list?: Array<{ mode: ModeShort; stageId: StageId }> | null;
	count: number;
	type: "BEST_OF" | "PLAY_ALL";
	pickBan?: PickBan.Type | null;
	customFlow?: CustomPickBanFlow | null;
}

export const WHO_SIDES = [
	"RANDOM",
	"RANDOM_OTHER",
	"ALPHA",
	"BRAVO",
	"HIGHER_SEED",
	"LOWER_SEED",
	"WINNER",
	"LOSER",
] as const;
export type WhoSide = (typeof WHO_SIDES)[number];

export const ACTION_TYPES = [
	"ROLL",
	"PICK",
	"PICK_NO_MODE_REPEAT",
	"BAN",
	"MODE_PICK",
	"MODE_BAN",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface CustomPickBanStep {
	action: ActionType;
	side?: WhoSide;
}

export interface CustomPickBanFlow {
	preSet: CustomPickBanStep[];
	postGame: CustomPickBanStep[];
}

/**
 * A round is a logical structure used to group multiple matches together.

  - In round-robin stages, a round can be viewed as a list of matches that can be played at the same time.
  - In swiss, a round is a list of matches that are played at the same time.
  - In elimination stages, a round is a round of a bracket, e.g. 8th finals, semi-finals, etc.
 */
export interface TournamentRound {
	groupId: number;
	id: GeneratedAlways<number>;
	number: number;
	stageId: number;
	maps: JSONColumnType<TournamentRoundMaps>;
}

// when updating this also update `defaultBracketSettings` in tournament-utils.ts
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

export const TOURNAMENT_STAGE_TYPES = [
	"single_elimination",
	"double_elimination",
	"round_robin",
	"swiss",
] as const;

/** A stage is an intermediate phase in a tournament. In essence a bracket. */
export interface TournamentStage {
	id: GeneratedAlways<number>;
	name: string;
	number: number;
	settings: JSONColumnType<StageSettings>;
	tournamentId: number;
	type: (typeof TOURNAMENT_STAGE_TYPES)[number];
	// not Generated<> because SQLite doesn't allow altering tables to add columns with default values :(
	createdAt: number | null;
}

/** Tournament sub post, shown in a list of subs available for teams to pick from. */
export interface TournamentSub {
	bestWeapons: string;
	/** 0 = no, 1 = yes, 2 = listen only */
	canVc: number;
	createdAt: Generated<number>;
	message: string | null;
	okWeapons: string | null;
	tournamentId: number;
	userId: number;
	visibility: "+1" | "+2" | "+3" | "ALL";
}

export interface TournamentLFGLike {
	likerTeamId: number;
	targetTeamId: number;
	createdAt: Generated<number>;
}

export const TOURNAMENT_STAFF_ROLES = ["ORGANIZER", "STREAMER"] as const;
type TournamentStaffRole = (typeof TOURNAMENT_STAFF_ROLES)[number];

export interface TournamentStaff {
	tournamentId: number;
	userId: number;
	role: TournamentStaffRole;
}

export interface TournamentTeam {
	createdAt: Generated<number>;
	id: GeneratedAlways<number>;
	inviteCode: string;
	name: string;
	prefersNotToHost: Generated<DBBoolean>;
	droppedOut: Generated<DBBoolean>;
	seed: number | null;
	/** For formats that have many starting brackets, where should the team start? */
	startingBracketIdx: number | null;
	activeRosterUserIds: JSONColumnTypeNullable<number[]>;
	tournamentId: number;
	teamId: number | null;
	avatarImgId: number | null;
	isLooking: Generated<DBBoolean>;
	isPlaceholder: Generated<DBBoolean>;
	lfgNote: string | null;
	chatCode: Generated<string | null>;
	/** A/B division assignment for bipartite round robin brackets. `0` = A, `1` = B, `null` = unassigned. */
	abDivision: number | null;
	/** The team's {@link TournamentTeamHistory} row, created lazily on its first audited event. */
	tournamentTeamHistoryId: number | null;
}

export interface TournamentTeamCheckIn {
	checkedInAt: number;
	/** Which bracket checked in for. If missing is check in for the whole event. */
	bracketIdx: number | null;
	tournamentTeamId: number;
	/** Indicates that this bracket defaults to checked in and this team has been explicitly checked out from it */
	isCheckOut: Generated<number>;
}

export interface TournamentTeamMember {
	createdAt: Generated<number>;
	inGameName: string | null;
	tournamentTeamId: number;
	userId: number;
	role: Generated<"OWNER" | "MANAGER" | "REGULAR">;
	isStayAsSub: Generated<DBBoolean>;
	/** Set when the member was added to the roster after registration closed. */
	isSub: Generated<DBBoolean>;
	// denormalized from TournamentTeam.isLooking
	isLooking: Generated<DBBoolean>;
}

/** Stable shadow of a tournament team's identity that survives the team's hard-deletion, so the audit log can still resolve its name. */
export interface TournamentTeamHistory {
	/** Surrogate key. Audit log rows reference this so a reused `TournamentTeam.id` can never collide with an older team's history. */
	id: GeneratedAlways<number>;
	/** Mirrors the original `TournamentTeam.id` at creation time. Informational only; not a live or unique foreign key, so it is not cascade-deleted with the team and may repeat across teams that reused an id. */
	tournamentTeamId: number;
	tournamentId: number;
	name: string;
}

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
] as const;

export interface TournamentAuditLog {
	id: GeneratedAlways<number>;
	tournamentId: number;
	type: (typeof TOURNAMENT_AUDIT_LOG_TYPES)[number];
	/** The user who performed the action. */
	actorUserId: number;
	/** The affected member, for member-level events. `null` for team-level events. */
	subjectUserId: number | null;
	/** References {@link TournamentTeamHistory.id} so the team name stays resolvable after the team is hard-deleted. */
	tournamentTeamHistoryId: number | null;
	metadata: JSONColumnTypeNullable<TournamentAuditLogMetadata>;
	createdAt: number;
}

export interface TournamentAuditLogMetadata {
	bracketIdx?: number;
	/** The new in-game name, for `UPDATE_IN_GAME_NAME` events. */
	inGameName?: string;
}

export interface TournamentOrganization {
	id: GeneratedAlways<number>;
	name: string;
	slug: string;
	description: string | null;
	socials: JSONColumnTypeNullable<string[]>;
	avatarImgId: number | null;
	isEstablished: Generated<DBBoolean>;
}

export const TOURNAMENT_ORGANIZATION_ROLES = [
	"ADMIN",
	"MEMBER",
	"ORGANIZER",
	"STREAMER",
] as const;
type TournamentOrganizationRole =
	(typeof TOURNAMENT_ORGANIZATION_ROLES)[number];

export interface TournamentOrganizationMember {
	organizationId: number;
	userId: number;
	role: TournamentOrganizationRole;
	roleDisplayName: string | null;
}

export interface TournamentOrganizationBadge {
	organizationId: number;
	badgeId: number;
}

export interface TournamentOrganizationSeries {
	id: GeneratedAlways<number>;
	organizationId: number;
	name: string;
	description: string | null;
	substringMatches: JSONColumnType<string[]>;
	showLeaderboard: Generated<number>;
	tierHistory: JSONColumnTypeNullable<TournamentTierNumber[]>;
}

export interface TournamentBracketProgressionOverride {
	sourceBracketIdx: number;
	destinationBracketIdx: number;
	tournamentTeamId: number;
	tournamentId: number;
}

export interface TournamentOrganizationBannedUser {
	organizationId: number;
	userId: number;
	privateNote: string | null;
	updatedAt: Generated<number>;
	expiresAt: number | null;
}

/** Indicates a user trusts another. Allows direct adding to groups/teams without invite links. */
export interface TrustRelationship {
	trustGiverUserId: number;
	trustReceiverUserId: number;
	lastUsedAt: number;
}

/** Mutual friendship between two users. Invariant: userOneId < userTwoId. */
export interface Friendship {
	id: GeneratedAlways<number>;
	userOneId: number;
	userTwoId: number;
	createdAt: Generated<number>;
}

/** Pending friend request from one user to another. */
export interface FriendRequest {
	id: GeneratedAlways<number>;
	senderId: number;
	receiverId: number;
	createdAt: Generated<number>;
}

export interface UnvalidatedUserSubmittedImage {
	id: GeneratedAlways<number>;
	submitterUserId: number;
	url: string;
	/** When was the image validated? If `null` should be hidden from other users. */
	validatedAt: number | null;
}

export interface UnvalidatedVideo {
	eventId: number | null;
	id: GeneratedAlways<number>;
	submitterUserId: number;
	title: string;
	type: string;
	validatedAt: number | null;
	youtubeDate: number;
	youtubeId: string;
}

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
	isFavorite: number;
}

export const BUILD_SORT_IDENTIFIERS = [
	"UPDATED_AT",
	"TOP_500",
	"WEAPON_POOL",
	"WEAPON_IN_GAME_ORDER",
	"ALPHABETICAL_TITLE",
	"MODE",
	"HEADGEAR_ID",
	"CLOTHES_ID",
	"SHOES_ID",
	"PUBLIC_BUILD",
	"PRIVATE_BUILD",
] as const;

export type BuildSort = (typeof BUILD_SORT_IDENTIFIERS)[number];

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

export const SUBJECT_PRONOUNS = ["he", "she", "they", "it", "any"] as const;
export const OBJECT_PRONOUNS = [
	"him",
	"her",
	"them",
	"its",
	"all",
	...SUBJECT_PRONOUNS,
] as const;

export type Pronouns = {
	subject: (typeof SUBJECT_PRONOUNS)[number];
	object: (typeof OBJECT_PRONOUNS)[number];
};

/** Card stat types that can be hidden from a user's card (kept here so `User.hiddenCardStats` does not import a feature module; keep in sync with the feature's `UserCardStat["type"]`). */
export type HideableUserCardStat = "XP" | "DIV";

export interface User {
	/** 1 = permabanned, timestamp = ban active till then */
	banned: Generated<number | null>;
	bannedReason: string | null;
	/** Shown on old user profile and Plus Voting */
	bio: string | null;
	/** Shown on user card */
	shortBio: string | null;
	commissionsOpen: Generated<number | null>;
	commissionsOpenedAt: number | null;
	commissionText: string | null;
	country: string | null;
	customTheme: JSONColumnTypeNullable<CustomTheme>;
	customUrl: string | null;
	discordAvatar: string | null;
	customAvatarImgId: number | null;
	discordId: string;
	discordName: string;
	customName: string | null;
	/** coalesce(customName, discordName) */
	username: ColumnType<string, never, never>;
	discordUniqueName: string | null;
	/** User's favorite badges they want to show on the front page of the badge display. Index = 0 big badge. */
	favoriteBadgeIds: ColumnType<number[] | null, string | null, string | null>;
	id: GeneratedAlways<number>;
	inGameName: string | null;
	isArtist: Generated<DBBoolean | null>;
	isVideoAdder: Generated<DBBoolean | null>;
	isTournamentOrganizer: Generated<DBBoolean | null>;
	isApiAccesser: Generated<DBBoolean | null>;
	languages: string | null;
	motionSens: number | null;
	pronouns: JSONColumnTypeNullable<Pronouns>;
	patronSince: number | null;
	patronTier: number | null;
	patronTill: number | null;
	showDiscordUniqueName: Generated<DBBoolean>;
	stickSens: number | null;
	twitch: string | null;
	bsky: string | null;
	battlefy: string | null;
	vc: Generated<"YES" | "NO" | "LISTEN_ONLY">;
	youtubeId: string | null;
	mapModePreferences: JSONColumnTypeNullable<UserMapModePreferences>;
	weaponPool: JSONColumnTypeNullable<WeaponPoolEntry[]>;
	plusSkippedForSeasonNth: number | null;
	noScreen: Generated<DBBoolean>;
	buildSorting: JSONColumnTypeNullable<BuildSort[]>;
	preferences: JSONColumnTypeNullable<UserPreferences>;
	/** User creation date. Can be null because we did not always save this. */
	createdAt: number | null;
	joinOrder: number | null;
	/** User card banner default selection, hex code or stage id. Note: supporters can also upload banner (stored in UserSubmittedImage, referenced by `bannerImgId` which takes precedence) */
	bannerPresetImg: JSONColumnTypeNullable<string | StageId>;
	/** Supporter-uploaded user card banner (UserSubmittedImage id). Takes precedence over `bannerPresetImg`. */
	bannerImgId: number | null;
	/** Card stat types the user has chosen to hide from their card. */
	hiddenCardStats: JSONColumnTypeNullable<Array<HideableUserCardStat>>;
	/** Div in the latest finished LUTI (e.g. "2" or "X"). Must have been in a team that did not drop and the user played at least one match (got result as well) */
	div: string | null;
	/** Peak XP as indicated by the user. Should have either `takoroka` or `tentatek` key defined but not both. */
	unverifiedPeakXP: JSONColumnTypeNullable<PeakXP>;
}

/** Represents User joined with PlusTier table */
export type UserWithPlusTier = Tables["User"] & {
	plusTier: PlusTier["tier"] | null;
};

export interface UserResultHighlight {
	teamId: number;
	userId: number;
}

export interface UserSubmittedImage {
	id: GeneratedAlways<number>;
	submitterUserId: number | null;
	url: string;
	validatedAt: number | null;
}

/** FTS5 trigram index over User's searchable columns (external content table,
 * kept in sync with triggers). Only meant for reading: filter with
 * `match` and join `rowid` to `User.id`. */
export interface UserSearch {
	rowid: GeneratedAlways<number>;
	username: GeneratedAlways<string | null>;
	inGameName: GeneratedAlways<string | null>;
	discordUniqueName: GeneratedAlways<string | null>;
	customUrl: GeneratedAlways<string | null>;
}

export interface UserWeapon {
	createdAt: Generated<number>;
	isFavorite: Generated<DBBoolean>;
	order: number;
	userId: number;
	weaponSplId: MainWeaponId;
}

export interface UserWeaponPool {
	userId: number;
	sortOrder: number;
	weaponSplId: MainWeaponId;
	isFavorite: Generated<DBBoolean>;
}

export interface TenStarWeapon {
	userId: number;
	weaponSplId: MainWeaponId;
}

export interface UserFriendCode {
	friendCode: string;
	userId: number;
	submitterUserId: number;
	createdAt: GeneratedAlways<number>;
}

export interface UserWidget {
	userId: number;
	index: number;
	widget: JSONColumnType<StoredWidget>;
}
export type ApiTokenType = "read" | "write";

export interface ApiToken {
	id: GeneratedAlways<number>;
	userId: number;
	token: string;
	type: Generated<ApiTokenType>;
	createdAt: GeneratedAlways<number>;
}

export interface LiveStream {
	id: GeneratedAlways<number>;
	userId: number | null;
	viewerCount: number;
	thumbnailUrl: string;
	twitch: string | null;
}

export interface TournamentStreamer {
	id: GeneratedAlways<number>;
	userId: number | null;
	tournamentId: number;
	twitchAccount: string;
}

export interface ExternalStream {
	id: GeneratedAlways<number>;
	name: string;
	url: string;
	avatarImgId: number | null;
	startTime: number;
	createdAt: Generated<number>;
}

export interface TournamentMatchVod {
	id: GeneratedAlways<number>;
	matchId: number;
	userId: number | null;
	platform: string;
	account: string;
	platformVideoId: string;
	timestampSeconds: number;
	viewCount: number;
}

export interface BanLog {
	id: GeneratedAlways<number>;
	userId: number;
	banned: number | null;
	bannedReason: string | null;
	bannedByUserId: number;
	createdAt: GeneratedAlways<number>;
}

export interface ModNote {
	id: GeneratedAlways<number>;
	userId: number;
	authorId: number;
	text: string;
	createdAt: GeneratedAlways<number>;
	isDeleted: Generated<DBBoolean>;
}

export const USER_REPORT_CATEGORIES = [
	"INAPPROPRIATE_CONTENT",
	"ALTING",
	"HARASSMENT",
	"CHEATING",
	"OTHER",
] as const;
export type UserReportCategory = (typeof USER_REPORT_CATEGORIES)[number];

export interface UserReport {
	id: GeneratedAlways<number>;
	reportedUserId: number;
	reporterUserId: number;
	category: UserReportCategory;
	description: string;
	matchId: number | null;
	createdAt: Generated<number>;
}

export interface Video {
	eventId: number | null;
	id: GeneratedAlways<number>;
	submitterUserId: number;
	title: string;
	type: "SCRIM" | "TOURNAMENT" | "MATCHMAKING" | "CAST" | "SENDOUQ";
	validatedAt: number | null;
	youtubeDate: number;
	youtubeId: string;
}

export interface VideoMatch {
	id: GeneratedAlways<number>;
	mode: ModeShort;
	stageId: StageId;
	startsAt: number;
	videoId: number;
}

export interface VideoMatchPlayer {
	player: number;
	playerName: string | null;
	playerUserId: number | null;
	videoMatchId: number;
	weaponSplId: number;
}

/** `WEST` = Tentatek division, `JPN` = Takoroka division. */
export type XRankPlacementRegion = "WEST" | "JPN";

export interface XRankPlacement {
	badges: string;
	bannerSplId: number;
	id: GeneratedAlways<number>;
	mode: ModeShort;
	month: number;
	name: string;
	nameDiscriminator: string;
	playerId: number;
	power: number;
	rank: number;
	region: XRankPlacementRegion;
	title: string;
	weaponSplId: MainWeaponId;
	year: number;
}

export interface ScrimPost {
	id: GeneratedAlways<number>;
	/** When is the scrim scheduled to happen */
	at: number;
	/** Optional end of time range indicating team accepts scrims starting between at and rangeEnd */
	rangeEnd: number | null;
	/** Highest LUTI div accepted */
	maxDiv: number | null;
	/** Lowest LUTI div accepted */
	minDiv: number | null;
	/** Who sees the post */
	visibility: JSONColumnTypeNullable<AssociationVisibility>;
	/** Any additional info */
	text: string | null;
	/** The key to access the scrim chat, used after scrim is scheduled with another team */
	chatCode: string;
	/** Refers to the team looking for the team (can also be a pick-up) */
	teamId: number | null;
	/** Indicates if anyone in the post can manage it */
	managedByAnyone: DBBoolean;
	/** When the scrim was canceled */
	canceledAt: number | null;
	/** User id who canceled the scrim */
	canceledByUserId: number | null;
	/** Reason for canceling the scrim */
	cancelReason: string | null;
	/** When the post was made was it scheduled for a future time slot (as opposed to looking now) */
	isScheduledForFuture: Generated<DBBoolean>;
	/** Maps/modes the scrim is available for. If null means no preference unless "mapsTournamentId" is set */
	maps: "SZ" | "ALL" | "RANKED" | null;
	/** If set, specifies the maps of a tournament to play */
	mapsTournamentId: number | null;
	createdAt: GeneratedAlways<number>;
	updatedAt: Generated<number>;
}

export interface ScrimMapList {
	id: GeneratedAlways<number>;
	scrimPostId: number;
	side: "ALPHA" | "BRAVO";
	source: "TOURNAMENT" | "POOL";
	tournamentId: number | null;
	serializedPool: string | null;
	updatedAt: number;
}

export interface ScrimMap {
	id: GeneratedAlways<number>;
	scrimPostId: number;
	index: number;
	mode: ModeShort;
	stageId: StageId;
	winnerSide: "ALPHA" | "BRAVO" | null;
	reportedAt: number | null;
	reportedByUserId: number | null;
}

export interface ScrimPostUser {
	scrimPostId: number;
	userId: number;
	/** User is the author of the post */
	isOwner: number;
}

export interface ScrimPostRequest {
	id: GeneratedAlways<number>;
	scrimPostId: number;
	teamId: number | null;
	message: string | null;
	/** Specific time selected by requester (required when post has rangeEnd) */
	at: number | null;
	isAccepted: Generated<DBBoolean>;
	createdAt: GeneratedAlways<number>;
}

export interface ScrimPostRequestUser {
	scrimPostRequestId: number;
	/** User that made the request */
	userId: number;
	isOwner: DBBoolean;
}

export interface Association {
	id: GeneratedAlways<number>;
	name: string;
	inviteCode: string;
	createdAt: GeneratedAlways<number>;
}

export interface AssociationMember {
	userId: number;
	associationId: number;
	role: "MEMBER" | "ADMIN";
}

export interface Notification {
	id: GeneratedAlways<number>;
	type: NotificationValue["type"];
	meta: JSONColumnTypeNullable<Record<string, number | string>>;
	pictureUrl: string | null;
	createdAt: GeneratedAlways<number>;
}

export interface NotificationUser {
	notificationId: number;
	userId: number;
	seen: Generated<DBBoolean>;
}

export interface NotificationSubscription {
	endpoint: string;
	keys: {
		auth: string;
		p256dh: string;
	};
}

/** A subscription of user's browser indicating where push notifications can be sent to. */
export interface NotificationUserSubscription {
	id: GeneratedAlways<number>;
	userId: number;
	subscription: JSONColumnType<NotificationSubscription>;
}

export const SPLATOON_ROTATION_TYPES = ["SERIES", "OPEN", "X"] as const;
export type SplatoonRotationType = (typeof SPLATOON_ROTATION_TYPES)[number];

export interface SplatoonRotation {
	id: GeneratedAlways<number>;
	type: SplatoonRotationType;
	mode: string;
	stageId1: number;
	stageId2: number;
	startTime: number;
	endTime: number;
}

export type Tables = { [P in keyof DB]: Selectable<DB[P]> };
export type TablesInsertable = { [P in keyof DB]: Insertable<DB[P]> };

export interface DB {
	AllTeam: Team;
	AllTeamMember: TeamMember;
	ApiToken: ApiToken;
	Art: Art;
	LiveStream: LiveStream;
	ArtTag: ArtTag;
	ArtUserMetadata: ArtUserMetadata;
	TaggedArt: TaggedArt;
	Badge: Badge;
	BadgeManager: BadgeManager;
	BadgeOwner: BadgeOwner;
	TournamentBadgeOwner: TournamentBadgeOwner;
	BanLog: BanLog;
	ModNote: ModNote;
	Build: Build;
	BuildAbilitySum: BuildAbilitySum;
	BuildWeapon: BuildWeapon;
	BuildWeaponAbility: BuildWeaponAbility;
	CalendarEvent: CalendarEvent;
	CalendarEventBadge: CalendarEventBadge;
	CalendarEventDate: CalendarEventDate;
	CalendarEventResultPlayer: CalendarEventResultPlayer;
	CalendarEventResultTeam: CalendarEventResultTeam;
	ExternalStream: ExternalStream;

	Group: Group;
	GroupLike: GroupLike;
	GroupMatch: GroupMatch;
	GroupMatchContinueVote: GroupMatchContinueVote;
	GroupMatchMap: GroupMatchMap;
	GroupMember: GroupMember;
	PrivateUserNote: PrivateUserNote;
	LogInLink: LogInLink;
	LFGPost: LFGPost;
	MapPoolMap: MapPoolMap;
	MapResult: MapResult;
	PlayerResult: PlayerResult;
	PlusSuggestion: PlusSuggestion;
	PlusTier: PlusTier;
	PlusVote: PlusVote;
	PlusVotingResult: PlusVotingResult;
	ReportedWeapon: ReportedWeapon;
	Skill: Skill;
	SkillTeamUser: SkillTeamUser;
	SeedingSkill: SeedingSkill;
	SplatoonPlayer: SplatoonPlayer;
	Team: Team;
	TeamMember: TeamMember;
	TeamMemberWithSecondary: TeamMember;
	Tournament: Tournament;
	TournamentStaff: TournamentStaff;
	TournamentGroup: TournamentGroup;
	TournamentLFGLike: TournamentLFGLike;
	TournamentMatch: TournamentMatch;
	TournamentMatchPickBanEvent: TournamentMatchPickBanEvent;
	TournamentMatchGameResult: TournamentMatchGameResult;
	TournamentMatchGameResultParticipant: TournamentMatchGameResultParticipant;
	TournamentResult: TournamentResult;
	TournamentRound: TournamentRound;
	TournamentStage: TournamentStage;
	TournamentSub: TournamentSub;
	TournamentTeam: TournamentTeam;
	TournamentTeamCheckIn: TournamentTeamCheckIn;
	TournamentTeamMember: TournamentTeamMember;
	TournamentTeamHistory: TournamentTeamHistory;
	TournamentAuditLog: TournamentAuditLog;
	TournamentOrganization: TournamentOrganization;
	TournamentOrganizationMember: TournamentOrganizationMember;
	TournamentOrganizationBadge: TournamentOrganizationBadge;
	TournamentOrganizationSeries: TournamentOrganizationSeries;
	TournamentBracketProgressionOverride: TournamentBracketProgressionOverride;
	TournamentOrganizationBannedUser: TournamentOrganizationBannedUser;
	TournamentStreamer: TournamentStreamer;
	TournamentMatchVod: TournamentMatchVod;
	TrustRelationship: TrustRelationship;
	Friendship: Friendship;
	FriendRequest: FriendRequest;
	UnvalidatedUserSubmittedImage: UnvalidatedUserSubmittedImage;
	UnvalidatedVideo: UnvalidatedVideo;
	User: User;
	UserSearch: UserSearch;
	UserResultHighlight: UserResultHighlight;
	UserSubmittedImage: UserSubmittedImage;
	UserWeapon: UserWeapon;
	UserWeaponPool: UserWeaponPool;
	TenStarWeapon: TenStarWeapon;
	UserFriendCode: UserFriendCode;
	UserWidget: UserWidget;
	UserReport: UserReport;
	Video: Video;
	VideoMatch: VideoMatch;
	VideoMatchPlayer: VideoMatchPlayer;
	XRankPlacement: XRankPlacement;
	ScrimPost: ScrimPost;
	ScrimPostUser: ScrimPostUser;
	ScrimPostRequest: ScrimPostRequest;
	ScrimPostRequestUser: ScrimPostRequestUser;
	ScrimMapList: ScrimMapList;
	ScrimMap: ScrimMap;
	Association: Association;
	AssociationMember: AssociationMember;
	Notification: Notification;
	NotificationUser: NotificationUser;
	NotificationUserSubscription: NotificationUserSubscription;
	SavedCalendarEvent: SavedCalendarEvent;
	SplatoonRotation: SplatoonRotation;
}
