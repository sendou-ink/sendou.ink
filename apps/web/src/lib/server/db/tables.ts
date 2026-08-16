import type {
	MainWeaponId,
	ModeShort,
} from "@sendou/in-game-lists/types";
import type {
	ColumnType,
	GeneratedAlways,
	Insertable,
	Selectable,
} from "kysely";
import type {
	PeakXP,
	UserPreferences,
	XRankPlacementRegion,
} from "#lib/db/tables-json.ts";
import type { CustomTheme } from "#lib/features/theme/theme-types.ts";
import type { SkillTeamIdentifier } from "#lib/features/mmr/mmr-utils.ts";
import type { UnifiedLanguageCode } from "#lib/modules/i18n/languages.ts";

/**
 * Trimmed port of `apps/web-react/app/db/tables.ts`: contains exactly the
 * tables (and columns) the migrated features query. Grows with each migrated
 * feature; the React app's file stays the source of truth until cutover.
 */

type Generated<T> =
	T extends ColumnType<infer S, infer I, infer U>
		? ColumnType<S, I | undefined, U>
		: ColumnType<T, T | undefined, T>;

/** In SQLite booleans are presented as 0 (false) and 1 (true) */
export type DBBoolean = 0 | 1;

export type JSONColumnTypeNullable<
	SelectType extends object | string | number | null,
> = ColumnType<SelectType | null, string | null, string | null>;

export type { PeakXP, UserPreferences, XRankPlacementRegion };

export interface User {
	/** 1 = permabanned, timestamp = ban active till then */
	banned: Generated<number | null>;
	bannedReason: string | null;
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
	/** Name the user is shown under in tournaments, set by organizers of established organizations. `null` = their `username` is used. */
	tournamentName: string | null;
	id: GeneratedAlways<number>;
	inGameName: string | null;
	isArtist: Generated<DBBoolean>;
	isVideoAdder: Generated<DBBoolean>;
	isTournamentOrganizer: Generated<DBBoolean>;
	isApiAccesser: Generated<DBBoolean>;
	languages: JSONColumnTypeNullable<UnifiedLanguageCode[]>;
	patronTier: number | null;
	preferences: JSONColumnTypeNullable<UserPreferences>;
	plusSkippedForSeasonNth: number | null;
	/** User creation date. Can be null because we did not always save this. */
	createdAt: number | null;
}

export interface PlusTier {
	tier: number;
	userId: number;
}

export interface UserFriendCode {
	friendCode: string;
	userId: number;
	submitterUserId: number;
	createdAt: Generated<number>;
}

/** Shape shared by the `AllTeam` table and the `Team` view. See {@link DB} for which to select from. */
export interface Team {
	avatarImgId: number | null;
	bannerImgId: number | null;
	createdAt: Generated<number>;
	customUrl: string;
	/** Soft delete marker. Always `null` when selected via the `Team` view, which filters these rows out. */
	deletedAt: number | null;
	id: GeneratedAlways<number>;
	inviteCode: string;
	name: string;
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
	/** User-defined ordering of members within a team (ascending) */
	order: Generated<number>;
	teamId: number;
	userId: number;
	isMainTeam: Generated<DBBoolean>;
}

/** Read-only. See {@link DB} for how this view relates to `UnvalidatedUserSubmittedImage`. */
export interface UserSubmittedImage {
	id: GeneratedAlways<number>;
	submitterUserId: number | null;
	url: string;
	/** Never `null` in practice, the view filters unvalidated rows out. */
	validatedAt: number | null;
}

export interface UnvalidatedUserSubmittedImage {
	id: GeneratedAlways<number>;
	submitterUserId: number;
	url: string;
	/** When was the image validated? If `null` should be hidden from other users. */
	validatedAt: number | null;
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

/** A team that is shown on the team leaderboard but doesn't count for its placements, e.g. because its players want to qualify with another roster. */
export interface LeaderboardTeamSkip {
	id: GeneratedAlways<number>;
	season: number;
	/** The team's roster, same as `Skill.identifier`. */
	identifier: SkillTeamIdentifier;
	skippedByUserId: number;
	createdAt: Generated<number>;
}

export interface SplatoonPlayer {
	id: GeneratedAlways<number>;
	splId: string;
	userId: number | null;
	/** Players best XP across both divisions. Denormalized for performance. */
	peakXp: JSONColumnTypeNullable<PeakXP>;
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

export interface ReportedWeapon {
	groupMatchId: number | null;
	tournamentMatchId: number | null;
	mapIndex: number;
	userId: number;
	weaponSplId: MainWeaponId;
	createdAt: Generated<number>;
}

export interface GroupMatch {
	alphaGroupId: number;
	bravoGroupId: number;
	chatCode: string | null;
	confirmedAt: number | null;
	confirmedByUserId: number | null;
	createdAt: Generated<number>;
	id: GeneratedAlways<number>;
	cancelRequestedByUserId: number | null;
	cancelAcceptedByUserId: number | null;
	noScreen: Generated<DBBoolean>;
}

export interface GroupMember {
	createdAt: Generated<number>;
	groupId: number;
	missedReadyCheckAt: number | null;
	note: string | null;
	userId: number;
}

export interface Tournament {
	id: GeneratedAlways<number>;
	/** Is the tournament finalized meaning all the matches are played and TO has locked it making it read-only */
	isFinalized: Generated<DBBoolean>;
}

export interface TournamentStage {
	id: GeneratedAlways<number>;
	name: string;
	number: number;
	tournamentId: number;
	createdAt: Generated<number>;
}

export interface TournamentMatch {
	chatCode: string | null;
	groupId: number;
	id: GeneratedAlways<number>;
	number: number;
	roundId: number;
	stageId: number;
	startedAt: number | null;
}

export interface TournamentResult {
	isHighlight: Generated<DBBoolean>;
	participantCount: number;
	placement: number;
	tournamentId: number;
	tournamentTeamId: number;
	/** The SP change in total after the finalization of a ranked tournament. */
	spDiff: number | null;
	userId: number;
	/** Division label for tournaments with multiple starting brackets (e.g., "D1", "D2") */
	div: string | null;
}

export type Tables = { [P in keyof DB]: Selectable<DB[P]> };
export type TablesInsertable = { [P in keyof DB]: Insertable<DB[P]> };

export interface DB {
	/** Table backing the `Team` view. Includes soft-deleted teams. */
	AllTeam: Team;
	/** Table backing the `TeamMember` & `TeamMemberWithSecondary` views. Includes members who have left and members of deleted teams. */
	AllTeamMember: TeamMember;
	GroupMatch: GroupMatch;
	GroupMember: GroupMember;
	LeaderboardTeamSkip: LeaderboardTeamSkip;
	PlusTier: PlusTier;
	ReportedWeapon: ReportedWeapon;
	Skill: Skill;
	SkillTeamUser: SkillTeamUser;
	SplatoonPlayer: SplatoonPlayer;
	/** View of `AllTeam` without soft-deleted teams. */
	Team: Team;
	/** View of `AllTeamMember` with only current members of the user's main team. */
	TeamMember: TeamMember;
	/** View of `AllTeamMember` with current members of both main and secondary teams. */
	TeamMemberWithSecondary: TeamMember;
	Tournament: Tournament;
	TournamentMatch: TournamentMatch;
	TournamentResult: TournamentResult;
	TournamentStage: TournamentStage;
	UnvalidatedUserSubmittedImage: UnvalidatedUserSubmittedImage;
	User: User;
	UserFriendCode: UserFriendCode;
	UserSubmittedImage: UserSubmittedImage;
	XRankPlacement: XRankPlacement;
}
