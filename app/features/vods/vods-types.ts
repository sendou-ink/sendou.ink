import type { z } from "zod";
import type { Tables } from "~/db/tables";
import type { MainWeaponId } from "~/modules/in-game-lists";
import type { videoMatchSchema, videoSchema } from "./vods-schemas";

export type VideoBeingAddedPartial = Partial<VideoBeingAdded>;

export type VideoBeingAdded = z.infer<typeof videoSchema>;

export type VideoMatchBeingAdded = z.infer<typeof videoMatchSchema>;

export interface Vod {
	id: Tables["Video"]["id"];
	pov?:
		| Pick<
				Tables["User"],
				"username" | "discordId" | "discordAvatar" | "customUrl" | "id"
		  >
		| string;
	title: Tables["Video"]["title"];
	type: Tables["Video"]["type"];
	youtubeDate: Tables["Video"]["youtubeDate"];
	youtubeId: Tables["Video"]["youtubeId"];
	matches: Array<VodMatch>;
	submitterUserId: Tables["Video"]["submitterUserId"];
}

export type VodMatch = Pick<
	Tables["VideoMatch"],
	"id" | "mode" | "stageId" | "startsAt"
> & {
	weapons: Array<MainWeaponId>;
};

export type ListVod = Omit<Vod, "youtubeDate" | "matches"> & {
	weapons: Array<MainWeaponId>;
	type: Tables["Video"]["type"];
};
