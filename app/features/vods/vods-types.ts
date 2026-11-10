import type { Tables } from "~/db/tables";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import type { DayMonthYear } from "~/utils/schema";

export interface VideoBeingAdded {
	type: Tables["Video"]["type"];
	youtubeUrl: string;
	title: string;
	date: DayMonthYear;
	pov?: { type: "USER"; userId: number } | { type: "NAME"; name: string };
	matches: Array<{
		startsAt: string;
		stageId: StageId;
		mode: ModeShort;
		weapons: MainWeaponId[];
	}>;
}

export interface Vod {
	id: Tables["Video"]["id"];
	pov?: CommonUser | string;
	title: Tables["Video"]["title"];
	type: Tables["Video"]["type"];
	youtubePublishedAt: Tables["Video"]["youtubePublishedAt"];
	youtubeId: Tables["Video"]["youtubeId"];
	matches: Array<VodMatch>;
	submitterUserId: Tables["Video"]["submitterUserId"];
}

type VodMatch = Pick<
	Tables["VideoMatch"],
	"id" | "mode" | "stageId" | "startsAt"
> & {
	weapons: Array<MainWeaponId>;
};

export type ListVod = Omit<Vod, "youtubePublishedAt" | "matches"> & {
	weapons: Array<MainWeaponId>;
	type: Tables["Video"]["type"];
};
