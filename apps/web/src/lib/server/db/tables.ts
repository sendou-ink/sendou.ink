import type {
	MainWeaponId,
	ModeShort,
} from "@sendou/in-game-lists/types";
import type {
	ColumnType,
	GeneratedAlways,
	Insertable,
	JSONColumnType,
	Selectable,
} from "kysely";
import type { AssociationVisibility } from "#lib/features/associations/associations-types.ts";
import type { Notification as NotificationValue } from "#lib/features/notifications/notifications-types.ts";
import type {
	TournamentSettingsLite,
	TournamentStaffRole,
	TournamentTierNumber,
} from "#lib/features/tournament/tournament-types.ts";
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
	patronStartedAt: number | null;
	preferences: JSONColumnTypeNullable<UserPreferences>;
	plusSkippedForSeasonNth: number | null;
	twitch: string | null;
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
	/** Trimmed to the fields the migrated features read; the React app's `TournamentSettings` stays the source of truth. */
	settings: JSONColumnType<TournamentSettingsLite>;
	id: GeneratedAlways<number>;
	/** Is the tournament finalized meaning all the matches are played and TO has locked it making it read-only */
	isFinalized: Generated<DBBoolean>;
	/** Tournament tier based on top teams' skill. 1=X, 2=S+, 3=S, 4=A+, 5=A, 6=B+, 7=B, 8=C+, 9=C */
	tier: TournamentTierNumber | null;
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
	hidden: Generated<DBBoolean>;
	tournamentId: number | null;
	organizationId: number | null;
	avatarImgId: number | null;
	trophyId: number | null;
}

export interface CalendarEventDate {
	eventId: number;
	id: GeneratedAlways<number>;
	startsAt: number;
}

export interface SavedCalendarEvent {
	id: GeneratedAlways<number>;
	userId: number;
	calendarEventId: number;
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
	/** The team's `TournamentTeamHistory` row, created lazily on its first audited event. */
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
	/** Set when the member was added to the roster by the tournament organizer instead of joining on their own. */
	isOrganizerAdded: Generated<DBBoolean>;
	// denormalized from TournamentTeam.isLooking
	isLooking: Generated<DBBoolean>;
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

export interface TournamentOrganizationSeries {
	id: GeneratedAlways<number>;
	organizationId: number;
	name: string;
	description: string | null;
	substringMatches: JSONColumnType<string[]>;
	showLeaderboard: Generated<DBBoolean>;
	tierHistory: JSONColumnTypeNullable<TournamentTierNumber[]>;
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

export interface Group {
	chatCode: string | null;
	createdAt: Generated<number>;
	id: GeneratedAlways<number>;
	inviteCode: string;
	latestActionAt: Generated<number>;
	/** If truthy, group was at least partly made in the matchmaking UI (/q/looking) */
	matchmade: Generated<DBBoolean>;
	status: "PREPARING" | "ACTIVE" | "INACTIVE" | "READY_CHECK";
	teamId: number | null;
}

export interface LiveStream {
	id: GeneratedAlways<number>;
	userId: number | null;
	viewerCount: number;
	thumbnailUrl: string;
	twitch: string | null;
}

export interface ExternalStream {
	id: GeneratedAlways<number>;
	name: string;
	url: string;
	avatarImgId: number | null;
	startsAt: number;
	createdAt: Generated<number>;
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
	CalendarEvent: CalendarEvent;
	CalendarEventDate: CalendarEventDate;
	ExternalStream: ExternalStream;
	FriendRequest: FriendRequest;
	Friendship: Friendship;
	Group: Group;
	GroupMatch: GroupMatch;
	GroupMember: GroupMember;
	LeaderboardTeamSkip: LeaderboardTeamSkip;
	LiveStream: LiveStream;
	Notification: Notification;
	NotificationUser: NotificationUser;
	PlusTier: PlusTier;
	ReportedWeapon: ReportedWeapon;
	SavedCalendarEvent: SavedCalendarEvent;
	ScrimPost: ScrimPost;
	ScrimPostRequest: ScrimPostRequest;
	ScrimPostRequestUser: ScrimPostRequestUser;
	ScrimPostUser: ScrimPostUser;
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
	TournamentMatchVod: TournamentMatchVod;
	TournamentOrganization: TournamentOrganization;
	TournamentOrganizationSeries: TournamentOrganizationSeries;
	TournamentResult: TournamentResult;
	TournamentStaff: TournamentStaff;
	TournamentStage: TournamentStage;
	TournamentTeam: TournamentTeam;
	TournamentTeamCheckIn: TournamentTeamCheckIn;
	TournamentTeamMember: TournamentTeamMember;
	UnvalidatedUserSubmittedImage: UnvalidatedUserSubmittedImage;
	User: User;
	UserFriendCode: UserFriendCode;
	UserSubmittedImage: UserSubmittedImage;
	XRankPlacement: XRankPlacement;
}
