/**
 * The database tables, 1:1 with the {@link DB} interface at the bottom. JSON column payload
 * shapes live either with their feature or, when they have no natural feature home, in
 * `tables-json.ts`; domain constants live in their feature's constants file.
 */

import type {
	ColumnType,
	GeneratedAlways,
	Insertable,
	JSONColumnType,
	Selectable,
} from "kysely";
import type {
	CastedMatchesInfo,
	CustomTheme,
	NotificationSubscription,
	ParsedMemento,
	PeakXP,
	PreparedMaps,
	Pronouns,
	SeedingSnapshot,
	TournamentAuditLogMetadata,
	TournamentRoundMaps,
	TournamentSettings,
	UserMapModePreferences,
	UserPreferences,
	WeaponPoolEntry,
	WinLossParticipationArray,
} from "~/db/tables-json";
import type { ApiTokenType } from "~/features/api/api-types";
import type { AssociationVisibility } from "~/features/associations/associations-types";
import type { CalendarEventTag } from "~/features/calendar/calendar-types";
import type { LFGType } from "~/features/lfg/lfg-constants";
import type { SkillTeamIdentifier } from "~/features/mmr/mmr-utils";
import type { Notification as NotificationValue } from "~/features/notifications/notifications-types";
import type { SplatoonRotationType } from "~/features/splatoon-rotations/splatoon-rotations-constants";
import type {
	MemberRole,
	MemberRoleType,
} from "~/features/team/team-constants";
import type { XRankPlacementRegion } from "~/features/top-search/top-search-types";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import type {
	TOURNAMENT_STAGE_TYPES,
	TournamentAuditLogType,
	TournamentMapPickingStyle,
	TournamentStaffRole,
} from "~/features/tournament/tournament-constants";
import type {
	ParticipantResult,
	Side,
	StageSettings,
} from "~/features/tournament-bracket/core/engine/types";
import type { TournamentOrganizationRole } from "~/features/tournament-organization/tournament-organization-constants";
import type { HideableUserCardStat } from "~/features/user-card/user-card-types";
import type { StoredWidget } from "~/features/user-page/core/widgets/types";
import type { BuildSort } from "~/features/user-page/user-page-constants";
import type { UserReportCategory } from "~/features/user-report/user-report-constants";
import type { videoMatchTypes } from "~/features/vods/vods-constants";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import type {
	Ability,
	BuildAbilitiesTuple,
	MainWeaponId,
	ModeShort,
	RankedModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { DBTournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import type { JSONColumnTypeNullable } from "~/utils/kysely.server";

type Generated<T> =
	T extends ColumnType<infer S, infer I, infer U>
		? ColumnType<S, I | undefined, U>
		: ColumnType<T, T | undefined, T>;

/** In SQLite booleans are presented as 0 (false) and 1 (true) */
export type DBBoolean = 0 | 1;

/** Shape shared by the `AllTeam` table and the `Team` view. See {@link DB} for which to select from. */
export interface Team {
	avatarImgId: number | null;
	bannerImgId: number | null;
	bio: string | null;
	createdAt: Generated<number>;
	customUrl: string;
	customTheme: JSONColumnTypeNullable<CustomTheme>;
	/** Soft delete marker. Always `null` when selected via the `Team` view, which filters these rows out. */
	deletedAt: number | null;
	id: GeneratedAlways<number>;
	inviteCode: string;
	name: string;
	bsky: string | null;
	mapModePreferences: JSONColumnTypeNullable<UserMapModePreferences>;
	/** Team's tag, typically used in-game in front of users' names to indicate they are a member of the team. */
	tag: string | null;
}

/**
 * Shape shared by the `AllTeamMember` table and the `TeamMember` &
 * `TeamMemberWithSecondary` views. See {@link DB} for which to select from.
 */
export interface TeamMember {
	createdAt: Generated<number>;
	isOwner: Generated<DBBoolean>;
	isManager: Generated<DBBoolean>;
	/** Always `null` when selected via the `TeamMember` or `TeamMemberWithSecondary` views, which filter these rows out. */
	leftAt: number | null;
	role: MemberRole | null;
	customRole: string | null;
	/** If customRole is defined, this classifies how the role should be treated */
	roleType: MemberRoleType | null;
	/** User-defined ordering of members within a team (ascending) */
	order: Generated<number>;
	teamId: number;
	userId: number;
	isMainTeam: Generated<DBBoolean>;
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

/** Read-only. See {@link DB} for how this view is composed. */
export interface BadgeOwner {
	badgeId: number;
	userId: number;
	count: number;
}

export interface Trophy {
	id: GeneratedAlways<number>;
	name: string;
	model: string;
	/** Identifies special trophies, null for regular trophies. */
	code: Generated<string | null>;
	organizationId: number | null;
	creatorId: number | null;
	managerId: number | null;
}

export interface TrophyOwner {
	trophyId: number;
	userId: number;
	tournamentId: number;
	tier: number | null;
}

export interface SpecialTrophyOwner {
	trophyId: number;
	userId: number;
	createdAt: number;
}

export interface PendingTrophy {
	id: GeneratedAlways<number>;
	name: string;
	model: string;
	description: string;
	organizationId: number | null;
	submitterUserId: number;
	createdAt: number;
	declineReason: string | null;
	declinedAt: number | null;
	declinedByUserId: number | null;
	targetTrophyId: number | null;
	managerId: number | null;
}

export interface PendingTrophyApproval {
	pendingTrophyId: number;
	userId: number;
	createdAt: number;
}

export interface Build {
	clothesGearSplId: number | null;
	description: string | null;
	headGearSplId: number | null;
	id: GeneratedAlways<number>;
	isPrivate: Generated<DBBoolean>;
	modes: JSONColumnTypeNullable<ModeShort[]>;
	ownerId: number;
	shoesGearSplId: number | null;
	title: string;
	updatedAt: Generated<number>;
	/** 3x4 ability tuple (head/clothes/shoes × main + 3 subs). */
	abilities: JSONColumnTypeNullable<BuildAbilitiesTuple>;
	/** Serialized ability+AP combo (e.g. `SSU_30,ISS_10`) used to group identical builds for the popular builds view. */
	abilitiesSignature: string | null;
}

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

/** Per-build ability point sums across all gear slots. Used to compute global `findAllAbilityPointAverages`. */
export interface BuildAbilitySum {
	buildId: number;
	ability: Ability;
	abilityPoints: number;
}

/** Per-weapon, per-build ability point sums. Used to compute per-weapon `findAllAbilityPointAverages`. One row per canonical weapon × build × ability with non-zero AP. */
export interface BuildWeaponAbility {
	canonicalWeaponSplId: MainWeaponId;
	buildId: number;
	ability: Ability;
	abilityPoints: number;
}

export interface CalendarEvent {
	authorId: number;
	bracketUrl: string;
	description: string | null;
	discordInviteCode: string | null;
	id: GeneratedAlways<number>;
	discordUrl: GeneratedAlways<string | null>;
	name: string;
	participantCount: number | null;
	tags: JSONColumnTypeNullable<CalendarEventTag[]>;
	hidden: Generated<DBBoolean>;
	tournamentId: number | null;
	organizationId: number | null;
	avatarImgId: number | null;
	trophyId: number | null;
}

export interface CalendarEventBadge {
	badgeId: number;
	eventId: number;
}

export interface CalendarEventDate {
	eventId: number;
	id: GeneratedAlways<number>;
	startsAt: number;
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
	isRechallenge: Generated<DBBoolean>;
}

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
	noScreen: Generated<DBBoolean>;
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
	source: DBTournamentMaplistSource;
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

export interface LFGPost {
	id: GeneratedAlways<number>;
	type: LFGType;
	text: string;
	/** e.g. Europe/Helsinki */
	timezone: string;
	authorId: number;
	teamId: number | null;
	plusTierVisibility: number | null;
	languages: JSONColumnTypeNullable<UnifiedLanguageCode[]>;
	updatedAt: Generated<number>;
	createdAt: Generated<number>;
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
	/** Was `otherUserId` on the same team as `ownerUserId` for these results? */
	type: "MATE" | "ENEMY";
}

export interface PlusSuggestion {
	authorId: number;
	createdAt: Generated<number>;
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
	/** When the vote stops being secret and starts counting towards the results i.e. the end of the voting range. */
	becomesValidAt: number;
	votedId: number;
	year: number;
}

/** Read-only. See {@link DB} for how this view is composed. */
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
	/** Set for team ratings, `null` for the solo ratings identified by `userId` instead. */
	identifier: SkillTeamIdentifier | null;
	matchesCount: number;
	mu: number;
	ordinal: number;
	sigma: number;
	season: number;
	tournamentId: number | null;
	userId: number | null;
	/** Can be null because we did not always save this. */
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

export interface SplatoonPlayer {
	id: GeneratedAlways<number>;
	splId: string;
	userId: number | null;
	/** Players best XP across both divisions. Denormalized for performance. */
	peakXp: JSONColumnTypeNullable<PeakXP>;
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

export interface TournamentMatch {
	chatCode: string | null;
	groupId: number;
	id: GeneratedAlways<number>;
	number: number;
	opponentOne: JSONColumnTypeNullable<ParticipantResult>;
	opponentTwo: JSONColumnTypeNullable<ParticipantResult>;
	roundId: number;
	stageId: number;
	// set when the match becomes playable i.e. its status is "STARTED"
	startedAt: number | null;
	/** The side that won the set. `null` while the match has no winner. */
	winnerSide: Side | null;
}

/** Represents one decision, pick or ban, during tournaments pick/ban (counterpick, ban 2) phase. */
export interface TournamentMatchPickBanEvent {
	type: "PICK" | "BAN" | "ROLL" | "MODE_PICK" | "MODE_BAN";
	stageId: StageId | null;
	mode: ModeShort | null;
	matchId: number;
	authorId: number | null;
	number: number;
	createdAt: Generated<number>;
}

export interface TournamentMatchGameResult {
	createdAt: Generated<number>;
	id: GeneratedAlways<number>;
	/** Whether the game ended in a knockout. `null` if not collected for this bracket. */
	ko: DBBoolean | null;
	matchId: number;
	mode: ModeShort;
	number: number;
	reporterId: number;
	source: DBTournamentMaplistSource;
	stageId: StageId;
	winnerTeamId: number;
}

export interface TournamentMatchGameResultParticipant {
	matchGameResultId: number;
	userId: number;
	tournamentTeamId: number;
}

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

/** A stage is an intermediate phase in a tournament. In essence a bracket. */
export interface TournamentStage {
	id: GeneratedAlways<number>;
	name: string;
	number: number;
	settings: JSONColumnType<StageSettings>;
	tournamentId: number;
	type: (typeof TOURNAMENT_STAGE_TYPES)[number];
	createdAt: Generated<number>;
}

export interface TournamentLFGLike {
	likerTeamId: number;
	targetTeamId: number;
	createdAt: Generated<number>;
}

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
	isCheckOut: Generated<DBBoolean>;
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

export interface TournamentAuditLog {
	id: GeneratedAlways<number>;
	tournamentId: number;
	type: TournamentAuditLogType;
	/** The user who performed the action. */
	actorUserId: number;
	/** The affected member, for member-level events. `null` for team-level events. */
	subjectUserId: number | null;
	/** References {@link TournamentTeamHistory.id} so the team name stays resolvable after the team is hard-deleted. */
	tournamentTeamHistoryId: number | null;
	metadata: JSONColumnTypeNullable<TournamentAuditLogMetadata>;
	createdAt: Generated<number>;
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
	showLeaderboard: Generated<DBBoolean>;
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
	type: (typeof videoMatchTypes)[number];
	validatedAt: number | null;
	/** When the video was published on YouTube. Day precision only, stored as noon UTC of that day. */
	youtubePublishedAt: number;
	youtubeId: string;
}

export interface User {
	/** 1 = permabanned, timestamp = ban active till then */
	banned: Generated<number | null>;
	bannedReason: string | null;
	/** Shown on old user profile and Plus Voting */
	bio: string | null;
	/** Shown on user card */
	shortBio: string | null;
	commissionsOpen: Generated<DBBoolean>;
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
	favoriteBadgeIds: JSONColumnTypeNullable<number[]>;
	favoriteTrophyIds: JSONColumnTypeNullable<number[]>;
	hiddenTrophyIds: JSONColumnTypeNullable<number[]>;
	id: GeneratedAlways<number>;
	inGameName: string | null;
	isArtist: Generated<DBBoolean>;
	isVideoAdder: Generated<DBBoolean>;
	isTournamentOrganizer: Generated<DBBoolean>;
	isApiAccesser: Generated<DBBoolean>;
	languages: JSONColumnTypeNullable<UnifiedLanguageCode[]>;
	motionSens: number | null;
	pronouns: JSONColumnTypeNullable<Pronouns>;
	patronStartedAt: number | null;
	patronTier: number | null;
	patronExpiresAt: number | null;
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

export interface UserResultHighlight {
	teamId: number;
	userId: number;
}

/** Read-only. See {@link DB} for how this view relates to `UnvalidatedUserSubmittedImage`. */
export interface UserSubmittedImage {
	id: GeneratedAlways<number>;
	submitterUserId: number | null;
	url: string;
	/** Never `null` in practice, the view filters unvalidated rows out. */
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
	createdAt: Generated<number>;
}

export interface UserWidget {
	userId: number;
	index: number;
	widget: JSONColumnType<StoredWidget>;
}
export interface ApiToken {
	id: GeneratedAlways<number>;
	userId: number;
	token: string;
	type: Generated<ApiTokenType>;
	createdAt: Generated<number>;
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
	startsAt: number;
	createdAt: Generated<number>;
}

export interface TournamentMatchVod {
	id: GeneratedAlways<number>;
	matchId: number;
	userId: number | null;
	platform: "TWITCH";
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
	createdAt: Generated<number>;
}

export interface ModNote {
	id: GeneratedAlways<number>;
	userId: number;
	authorId: number;
	text: string;
	createdAt: Generated<number>;
	isDeleted: Generated<DBBoolean>;
}

export interface UserReport {
	id: GeneratedAlways<number>;
	reportedUserId: number;
	reporterUserId: number;
	category: UserReportCategory;
	description: string;
	matchId: number | null;
	createdAt: Generated<number>;
}

/** Read-only. See {@link DB} for how this view relates to `UnvalidatedVideo`. */
export interface Video {
	eventId: number | null;
	id: GeneratedAlways<number>;
	submitterUserId: number;
	title: string;
	type: (typeof videoMatchTypes)[number];
	/** Never `null` in practice, the view filters unvalidated rows out. */
	validatedAt: number | null;
	/** When the video was published on YouTube. Day precision only, stored as noon UTC of that day. */
	youtubePublishedAt: number;
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
	startsAt: number;
	/** Optional end of time range indicating team accepts scrims starting between startsAt and rangeEndsAt */
	rangeEndsAt: number | null;
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
	createdAt: Generated<number>;
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
	isOwner: DBBoolean;
}

export interface ScrimPostRequest {
	id: GeneratedAlways<number>;
	scrimPostId: number;
	teamId: number | null;
	message: string | null;
	/** Specific time selected by requester (required when post has rangeEndsAt) */
	startsAt: number | null;
	isAccepted: Generated<DBBoolean>;
	createdAt: Generated<number>;
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
	createdAt: Generated<number>;
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
	createdAt: Generated<number>;
}

export interface NotificationUser {
	notificationId: number;
	userId: number;
	seen: Generated<DBBoolean>;
}

/** A subscription of user's browser indicating where push notifications can be sent to. */
export interface NotificationUserSubscription {
	id: GeneratedAlways<number>;
	userId: number;
	subscription: JSONColumnType<NotificationSubscription>;
}

export interface SplatoonRotation {
	id: GeneratedAlways<number>;
	type: SplatoonRotationType;
	mode: RankedModeShort;
	stageId1: number;
	stageId2: number;
	startsAt: number;
	endsAt: number;
}

export type Tables = { [P in keyof DB]: Selectable<DB[P]> };
export type TablesInsertable = { [P in keyof DB]: Insertable<DB[P]> };

/**
 * Every table and view available to query.
 *
 * Some entries are SQL **views**, not tables. They are marked below and can not
 * be inserted into or updated. Two naming conventions exist for the
 * table/view pairing, both meaning "base table vs. filtered view":
 * - `All` prefix on the table: `AllTeam` (table) / `Team` (view)
 * - `Unvalidated` prefix on the table: `UnvalidatedVideo` (table) / `Video` (view)
 *
 * In both cases write to the prefixed table and read from the unprefixed view
 * unless you specifically want the filtered-out rows.
 */
export interface DB {
	/** Table backing the `Team` view. Includes soft-deleted teams. */
	AllTeam: Team;
	/** Table backing the `TeamMember` & `TeamMemberWithSecondary` views. Includes members who have left and members of deleted teams. */
	AllTeamMember: TeamMember;
	ApiToken: ApiToken;
	Art: Art;
	LiveStream: LiveStream;
	ArtTag: ArtTag;
	ArtUserMetadata: ArtUserMetadata;
	TaggedArt: TaggedArt;
	Badge: Badge;
	BadgeManager: BadgeManager;
	/** VIEW, read-only. `TournamentBadgeOwner` rows plus a synthetic patron badge row per patron of tier 2+. */
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
	/** VIEW, read-only. `PlusVote` rows aggregated per (votedId, tier, month, year) with the average score. */
	PlusVotingResult: PlusVotingResult;
	ReportedWeapon: ReportedWeapon;
	Skill: Skill;
	SkillTeamUser: SkillTeamUser;
	SeedingSkill: SeedingSkill;
	SplatoonPlayer: SplatoonPlayer;
	/** VIEW over `AllTeam`, excludes soft-deleted teams. Insert/update via `AllTeam`. */
	Team: Team;
	/** VIEW over `AllTeamMember`, excludes members who have left, members of deleted teams, and members whose secondary team this is. Insert/update via `AllTeamMember`. */
	TeamMember: TeamMember;
	/** VIEW over `AllTeamMember`, same as `TeamMember` but also includes rows where this is the member's secondary (i.e. non-main) team. Insert/update via `AllTeamMember`. */
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
	Trophy: Trophy;
	TrophyOwner: TrophyOwner;
	SpecialTrophyOwner: SpecialTrophyOwner;
	PendingTrophy: PendingTrophy;
	PendingTrophyApproval: PendingTrophyApproval;
	TrustRelationship: TrustRelationship;
	Friendship: Friendship;
	FriendRequest: FriendRequest;
	/** Table backing the `UserSubmittedImage` view. Includes images awaiting validation. */
	UnvalidatedUserSubmittedImage: UnvalidatedUserSubmittedImage;
	/** Table backing the `Video` view. Includes videos awaiting validation. */
	UnvalidatedVideo: UnvalidatedVideo;
	User: User;
	UserSearch: UserSearch;
	UserResultHighlight: UserResultHighlight;
	/** VIEW over `UnvalidatedUserSubmittedImage`, excludes images awaiting validation. Insert/update via `UnvalidatedUserSubmittedImage`. */
	UserSubmittedImage: UserSubmittedImage;
	UserWeapon: UserWeapon;
	UserWeaponPool: UserWeaponPool;
	TenStarWeapon: TenStarWeapon;
	UserFriendCode: UserFriendCode;
	UserWidget: UserWidget;
	UserReport: UserReport;
	/** VIEW over `UnvalidatedVideo`, excludes videos awaiting validation. Insert/update via `UnvalidatedVideo`. */
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
