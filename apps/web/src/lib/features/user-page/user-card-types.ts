import type { StageId } from "@sendou/in-game-lists/types";
import type { XRankPlacementRegion } from "#lib/db/tables-json.ts";
import type { TieredSkill } from "#lib/features/mmr/tiered.server.ts";
import type { CustomTheme } from "#lib/features/theme/theme-types.ts";
import type { CommonUser } from "#lib/server/kysely.ts";
import type { Tables } from "#lib/server/db/tables.ts";

export interface UserCardData extends CommonUser {
	banner: UserCarBannerData;
	shortBio: string | null;
	customTheme: CustomTheme | null;
	friendCode: string | null;
	/** Id of the user's free agent LFG post, or `null` if they have none. */
	freeAgentPostId: number | null;
	/** The viewer's private note about this user, or `null` when they have none. */
	privateNote: Pick<
		Tables["PrivateUserNote"],
		"text" | "sentiment" | "updatedAt"
	> | null;
	stats: Array<UserCardStat>;
}

/**
 * Viewer-relative card fields lazy-loaded when the card opens (see the
 * `/user-card/:id/friendship` resource route), kept out of the batched `UserCardData`
 * query because they are only needed for the one card a viewer actually opens.
 */
export interface UserCardFriendship {
	isFriend: boolean;
	/** Whether the viewer has a pending friend request sent to this user. */
	sentFriendRequest: boolean;
	/** Id of this user's pending friend request to the viewer, or `null` when there is none. */
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

/** Card stat types that a user can hide from their card. */
export type HideableUserCardStat = Extract<UserCardStat["type"], "XP" | "DIV">;

export interface UserCardStatXPValue {
	isVerified: boolean;
	region: XRankPlacementRegion;
	points: number;
}
