import type { CustomTheme, Tables } from "~/db/tables";
import type { StageId } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import type { TieredSkill } from "../mmr/tiered.server";

interface UserCardData extends CommonUser {
	banner: UserCarBannerData;
	shortBio: string | null;
	customTheme: CustomTheme | null;
	friendCode: string | null;
	isFriend: boolean;
	mutualFriends: Array<CommonUser>;
	privateNote: Pick<Tables["PrivateUserNote"], "text" | "sentiment">;
	stats: Array<UserCardStat>;
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

type UserCardStat =
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
			value: string;
	  }
	| {
			type: "SEASON";
			value: TieredSkill["tier"];
	  };

interface UserCardStatXPValue {
	isVerified: boolean;
	div: "TENTATEK" | "TAKOROKA";
	points: number;
}
