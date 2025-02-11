import type { Tables } from "~/db/tables";
import type {
	Group,
	GroupMember,
	ParsedMemento,
	PlusTier,
	User,
} from "~/db/types";
import type { MainWeaponId, ModeShort } from "~/modules/in-game-lists";
import type { TieredSkill } from "../mmr/tiered.server";
import type { GroupForMatch } from "../sendouq-match/QMatchRepository.server";

export type LookingGroup = {
	id: number;
	createdAt: Group["createdAt"];
	tier?: TieredSkill["tier"];
	tierRange?: {
		range?: [TieredSkill["tier"], TieredSkill["tier"]];
		diff: number;
	};
	isReplay?: boolean;
	isNoScreen?: boolean;
	isLiked?: boolean;
	isRechallenge?: boolean;
	team?: GroupForMatch["team"];
	chatCode?: Group["chatCode"];
	mapModePreferences?: Array<NonNullable<Tables["User"]["mapModePreferences"]>>;
	futureMatchModes?: Array<ModeShort>;
	rechallengeMatchModes?: Array<ModeShort>;
	skillDifference?: ParsedMemento["groups"][number]["skillDifference"];
	members?: {
		id: number;
		discordId: string;
		username: string;
		discordAvatar: string | null;
		noScreen?: number;
		customUrl?: User["customUrl"];
		plusTier?: PlusTier["tier"];
		role: GroupMember["role"];
		note?: GroupMember["note"];
		weapons?: MainWeaponId[];
		skill?: TieredSkill | "CALCULATING";
		vc?: User["vc"];
		inGameName?: User["inGameName"];
		languages: string[];
		chatNameColor: string | null;
		skillDifference?: ParsedMemento["users"][number]["skillDifference"];
		friendCode?: string;
		privateNote: Pick<
			Tables["PrivateUserNote"],
			"sentiment" | "text" | "updatedAt"
		> | null;
	}[];
};

export type LookingGroupWithInviteCode = LookingGroup & {
	inviteCode: Group["inviteCode"];
	members: NonNullable<LookingGroup["members"]>;
};

export interface DividedGroups {
	own?: LookingGroup | LookingGroupWithInviteCode;
	neutral: LookingGroup[];
	likesReceived: LookingGroup[];
}

export interface DividedGroupsUncensored {
	own?: LookingGroupWithInviteCode;
	neutral: LookingGroupWithInviteCode[];
	likesReceived: LookingGroupWithInviteCode[];
}

export type GroupExpiryStatus = "EXPIRING_SOON" | "EXPIRED";
