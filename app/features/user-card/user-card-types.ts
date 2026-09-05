import type { Tables } from "~/db/tables";
import type { CustomTheme } from "~/db/tables-json";
import type { XRankPlacementRegion } from "~/features/top-search/top-search-types";
import type { StageId } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import type { TieredSkill } from "../mmr/tiered.server";

export interface UserCardData extends CommonUser {
	banner: UserCarBannerData;
	shortBio: string | null;
	customTheme: CustomTheme | null;
	friendCode: string | null;
	freeAgentPostId: number | null;
	privateNote: Pick<
		Tables["PrivateUserNote"],
		"text" | "sentiment" | "updatedAt"
	> | null;
	stats: Array<UserCardStat>;
}

/** Viewer-relative fields lazy-loaded from `/user-card/:id/friendship` when a card opens. */
export interface UserCardFriendship {
	isFriend: boolean;
	sentFriendRequest: boolean;
	incomingFriendRequestId: number | null;
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

export type HideableUserCardStat = Extract<UserCardStat["type"], "XP" | "DIV">;

export interface UserCardStatXPValue {
	isVerified: boolean;
	region: XRankPlacementRegion;
	points: number;
}
