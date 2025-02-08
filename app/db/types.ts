import type {
	persistedTags,
	tags,
} from "~/features/calendar/calendar-constants";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import type { TEAM_MEMBER_ROLES } from "~/features/team/team-constants";
import type {
	Ability,
	MainWeaponId,
	ModeShort,
	RankedModeShort,
	StageId,
} from "~/modules/in-game-lists";

export interface User {
	id: number;
	discordId: string;
	/** Discord display name aka global name (non-unique) */
	discordName: string;
	username: string;
	discordAvatar: string | null;
	/** Discord username (unique) */
	discordUniqueName: string | null;
	showDiscordUniqueName: number;
	twitch: string | null;
	youtubeId: string | null;
	bio: string | null;
	css: string | null;
	country: string | null;
	customUrl: string | null;
	stickSens: number | null;
	motionSens: number | null;
	inGameName: string | null;
	patronTier: number | null;
	patronSince: number | null;
	/** Used to overwrite normal patron giving process and force give the patron status till this date */
	patronTill: number | null;
	isVideoAdder: number;
	isArtist: number;
	favoriteBadgeId: number | null;
	commissionsOpen: number;
	commissionText: string | null;
	banned: number;
	vc: "YES" | "NO" | "LISTEN_ONLY";
	languages: string | null;
}

/** User table after joined with PlusTier table */
export interface UserWithPlusTier extends User {
	plusTier: PlusTier["tier"] | null;
}

export interface UserWeapon {
	userId: number;
	weaponSplId: MainWeaponId;
	createdAt: number;
	order: number;
	isFavorite: number;
}

export interface LogInLink {
	code: string;
	expiresAt: number;
	userId: number;
}

export interface PlusSuggestion {
	id: number;
	text: string;
	authorId: number;
	suggestedId: number;
	month: number;
	year: number;
	tier: number;
	createdAt: number;
}

export interface PlusVote {
	month: number;
	year: number;
	tier: number;
	authorId: number;
	votedId: number;
	score: number;
	validAfter: number;
}

export interface PlusVotingResult {
	votedId: number;
	tier: number;
	score: number;
	month: number;
	year: number;
	wasSuggested: number;
	passedVoting: number;
}

export interface PlusTier {
	userId: number;
	tier: number;
}

export interface Badge {
	id: number;
	code: string;
	displayName: string;
	hue?: number;
}

/** View that is union of TournamentBadgeOwner and Patreon badges */
export interface BadgeOwner {
	badgeId: number;
	userId: number;
}

export interface TournamentBadgeOwner {
	badgeId: number;
	userId: number;
}

export interface BadgeManager {
	badgeId: number;
	userId: number;
}

export interface CalendarEvent {
	id: number;
	name: string;
	authorId: number;
	tags: string | null;
	description: string | null;
	discordInviteCode: string | null;
	// generated column
	discordUrl: string | null;
	bracketUrl: string;
	participantCount: number | null;
	tournamentId: number | null;
}

export type PersistedCalendarEventTag = keyof typeof persistedTags;
export type CalendarEventTag = keyof typeof tags;

export interface CalendarEventDate {
	id: number;
	eventId: number;
	startTime: number;
}

export interface CalendarEventResultTeam {
	id: number;
	eventId: number;
	name: string;
	placement: number;
}

export interface CalendarEventResultPlayer {
	teamId: number;
	userId: number | null;
	name: string | null;
}

export interface UserResultHighlight {
	teamId: number;
	userId: number;
}

export interface CalendarEventBadge {
	eventId: number;
	badgeId: number;
}

export interface Build {
	id: number;
	ownerId: number;
	title: string;
	/** Private builds are only visible on the user builds page to the owner only */
	private: number | null;
	description: string | null;
	modes: string | null;
	headGearSplId: number;
	clothesGearSplId: number;
	shoesGearSplId: number;
	updatedAt: number;
}

export interface BuildWeapon {
	buildId: number;
	weaponSplId: MainWeaponId;
}

export type GearType = "HEAD" | "CLOTHES" | "SHOES";

export interface BuildAbility {
	buildId: number;
	gearType: "HEAD" | "CLOTHES" | "SHOES";
	ability: Ability;
	slotIndex: 0 | 1 | 2 | 3;
	abilityPoints: number; // 3 or 10
}

export interface MapPoolMap {
	calendarEventId: number | null; // Part of tournament's map pool
	tournamentTeamId: number | null; // Part of team's map pool
	tieBreakerCalendarEventId: number | null; // Part of the tournament's tiebreaker pool
	stageId: StageId;
	mode: ModeShort;
}

// AUTO = style where teams pick their map pool ahead of time and the map lists are automatically made for each round
// could also have the traditional style where TO picks the maps later
type TournamentMapPickingStyle =
	| "AUTO_ALL"
	| "AUTO_SZ"
	| "AUTO_TC"
	| "AUTO_RM"
	| "AUTO_CB";

// TODO: later also e.g. RR_TO_DE where we also need an additional field
// describing how many teams advance
export type TournamentFormat = "SE" | "DE";

export interface Tournament {
	id: number;
	mapPickingStyle: TournamentMapPickingStyle;
	format: TournamentFormat;
}

export interface TournamentTeam {
	id: number;
	name: string;
	createdAt: number;
	seed: number | null;
	tournamentId: number;
	inviteCode: string;
	prefersNotToHost: number;
}

export interface TournamentTeamCheckIn {
	tournamentTeamId: number;
	checkedInAt: number;
}

export interface TournamentTeamMember {
	tournamentTeamId: number;
	userId: number;
	isOwner: number;
	createdAt: number;
}

/** A stage is an intermediate phase in a tournament.
 * Supported stage types are round-robin, single elimination and double elimination. */
export interface TournamentStage {
	id: number;
	tournamentId: number;
	name: string;
	type: "round_robin" | "single_elimination" | "double_elimination";
	settings: string; // json
	number: number;
	createdAt: number | null;
}

/** A group is a logical structure used to group multiple rounds together.

- In round-robin stages, a group is a pool.
- In elimination stages, a group is a bracket.
    - A single elimination stage can have one or two groups:
      - The unique bracket.
      - If enabled, the Consolation Final.
    - A double elimination stage can have two or three groups:
      - Upper and lower brackets.
      - If enabled, the Grand Final. */
export interface TournamentGroup {
	id: number;
	stageId: number;
	/** In double elimination 1 = Winners, 2 = Losers, 3 = Grand Finals+Bracket Reset */
	number: number;
}

/** 
 * A round is a logical structure used to group multiple matches together.

  - In round-robin stages, a round can be viewed as a day or just as a list of matches that can be played at the same time.
  - In elimination stages, a round is a round of a bracket, e.g. 8th finals, semi-finals, etc.
 */
export interface TournamentRound {
	id: number;
	stageId: number;
	groupId: number;
	number: number;
}

export enum Status {
	/** The two matches leading to this one are not completed yet. */
	Locked = 0,

	/** One participant is ready and waiting for the other one. */
	Waiting = 1,

	/** Both participants are ready to start. */
	Ready = 2,

	/** The match is running. */
	Running = 3,

	/** The match is completed. */
	Completed = 4,
}

/** A match between two participants (more participants are not allowed).
 * Participants can be teams or individuals. */
export interface TournamentMatch {
	id: number;
	bestOf: 3 | 5 | 7;
	roundId: number;
	stageId: number;
	groupId: number;
	number: number;
	opponentOne: string; // json
	opponentTwo: string; // json
	status: Status;
	chatCode: string | null;
}

export interface TournamentMatchGameResult {
	id: number;
	matchId: number;
	number: number;
	stageId: StageId;
	mode: ModeShort;
	/** serialized TournamentMaplistSource */
	source: string;
	winnerTeamId: number;
	reporterId: number;
	createdAt: number;
}

export interface TournamentMatchGameResultParticipant {
	matchGameResultId: number;
	userId: number;
}

export interface TournamentSub {
	userId: number;
	tournamentId: number;
	canVc: number;
	bestWeapons: string;
	okWeapons: string | null;
	message: string | null;
	visibility: "+1" | "+2" | "+3" | "ALL";
	createdAt: number;
}

export interface Skill {
	id: number;
	mu: number;
	sigma: number;
	ordinal: number;
	userId: number | null;
	/** e.g. 12-24-44-1024 for "team skills" */
	identifier: string | null;
	matchesCount: number;
	/** Tournament that caused the skill to change */
	tournamentId: number | null;
	/** Group match that caused the skill to change */
	groupMatchId: number | null;
	season: number;
}

export interface SkillTeamUser {
	userId: number;
	skillId: number;
}

export interface MapResult {
	mode: ModeShort;
	stageId: StageId;
	userId: number;
	wins: number;
	losses: number;
	season: number;
}

export interface PlayerResult {
	ownerUserId: number;
	otherUserId: number;
	mapWins: number;
	mapLosses: number;
	setWins: number;
	setLosses: number;
	type: "MATE" | "ENEMY";
	season: number;
}

export interface TournamentResult {
	tournamentId: number;
	userId: number;
	placement: number;
	participantCount: number;
	tournamentTeamId: number;
	isHighlight: number;
}

export interface TrustRelationship {
	trustGiverUserId: number;
	trustReceiverUserId: number;
}

export interface UserSubmittedImage {
	id: number;
	validatedAt: number | null;
	url: string;
	submitterUserId: number;
}

export interface Team {
	id: number;
	name: string;
	customUrl: string;
	inviteCode: string;
	css: string | null;
	bio: string | null;
	avatarImgId: number | null;
	bannerImgId: number | null;
	createdAt: number;
	deletedAt: number | null;
}

export type MemberRole = (typeof TEAM_MEMBER_ROLES)[number];

export interface TeamMember {
	teamId: number;
	userId: number;
	role: MemberRole | null;
	isOwner: number;
	createdAt: number;
	leftAt: number | null;
}

export interface Video {
	id: number;
	title: string;
	type: "SCRIM" | "TOURNAMENT" | "MATCHMAKING" | "CAST" | "SENDOUQ";
	youtubeDate: number;
	eventId: number | null;
	youtubeId: string;
	submitterUserId: number;
	validatedAt: number | null;
}

export interface VideoMatch {
	id: number;
	videoId: number;
	startsAt: number;
	stageId: StageId;
	mode: ModeShort;
}

export interface VideoMatchPlayer {
	videoMatchId: number;
	playerUserId: number | null;
	playerName: string | null;
	weaponSplId: MainWeaponId;
	player: number;
}

export interface XRankPlacement {
	id: number;
	weaponSplId: MainWeaponId;
	name: string;
	nameDiscriminator: string;
	power: number;
	rank: number;
	title: string;
	badges: string; // badge id's separated by comma
	bannerSplId: number;
	playerId: number;
	month: number;
	year: number;
	mode: RankedModeShort;
	region: "WEST" | "JPN";
}

export interface SplatoonPlayer {
	id: number;
	userId: number;
	splId: string;
}

export interface Art {
	id: number;
	imgId: number;
	authorId: number;
	isShowcase: number;
	description: string | null;
	createdAt: number;
}

export interface ArtTag {
	id: number;
	name: string;
	authorId: number;
	createdAt: number;
}

export interface TaggedArt {
	artId: number;
	tagId: number;
}

export interface ArtUserMetadata {
	artId: number;
	userId: number;
}

export interface Group {
	id: number;
	teamId: number | null;
	createdAt: number;
	latestActionAt: number;
	inviteCode: string;
	chatCode: string | null;
	status: "PREPARING" | "ACTIVE" | "INACTIVE";
}

export interface GroupMember {
	groupId: number;
	userId: number;
	role: "OWNER" | "MANAGER" | "REGULAR";
	note: string | null;
	createdAt: number;
}

export interface GroupLike {
	likerGroupId: number;
	targetGroupId: number;
	createdAt: number;
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
		User["id"],
		{
			plusTier?: PlusTier["tier"];
			skill?: TieredSkill;
			skillDifference?: UserSkillDifference;
		}
	>;
	groups: Record<
		Group["id"],
		{
			tier?: TieredSkill["tier"];
			skillDifference?: GroupSkillDifference;
		}
	>;
};
export interface GroupMatch {
	id: number;
	alphaGroupId: number;
	bravoGroupId: number;
	createdAt: number;
	reportedAt: number | null;
	reportedByUserId: number | null;
	chatCode: string | null;
	memento: string | null;
}

export interface GroupMatchMap {
	id: number;
	matchId: number;
	index: number;
	mode: ModeShort;
	stageId: StageId;
	/** serialized TournamentMaplistSource */
	source: string;
	winnerGroupId: number | null;
}

export interface ReportedWeapon {
	groupMatchMapId: number | null;
	weaponSplId: MainWeaponId;
	userId: User["id"];
}
