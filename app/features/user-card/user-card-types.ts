import type { CustomTheme, Tables, XRankPlacementRegion } from "~/db/tables";
import type { StageId } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import type { TieredSkill } from "../mmr/tiered.server";

export interface UserCardData extends CommonUser {
	banner: UserCarBannerData;
	shortBio: string | null;
	customTheme: CustomTheme | null;
	friendCode: string | null;
	/** Id of the user's free agent LFG post, or `null` if they have none. */
	freeAgentPostId: number | null;
	privateNote: Pick<Tables["PrivateUserNote"], "text" | "sentiment">;
	stats: Array<UserCardStat>;
	/** Stat types the user has chosen to hide; filtered out of `stats` at render time. */
	hiddenStats: Array<UserCardStat["type"]>;
}

/**
 * Viewer-relative card fields lazy-loaded when the card opens (see the
 * `/user-card/:id/friendship` resource route), kept out of the batched `UserCardData`
 * query because they are only needed for the one card a viewer actually opens.
 */
export interface UserCardFriendship {
	isFriend: boolean;
	/** Whether a friend request between the viewer and this user is currently pending. */
	hasPendingFriendRequest: boolean;
	mutualFriends: Array<CommonUser>;
}

type UserCarBannerData =
	| {
			type: "URL";
			url: string;
	  }
	| {
			type: "COLOR";
			hexCode: string;
	  }
	| {
			type: "STAGE";
			stageId: StageId;
	  };

export type UserCardStat =
	| {
			type: "XP";
			values: Array<UserCardStatXPValue>;
	  }
	| {
			type: "DIV";
			value: string;
	  }
	| {
			type: "PLUS";
			value: number;
	  }
	| {
			type: "SEASON";
			value: TieredSkill["tier"];
			top: number | null;
	  };

export interface UserCardStatXPValue {
	isVerified: boolean;
	region: XRankPlacementRegion;
	points: number;
}
