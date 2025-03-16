import type { z } from "zod";
import type { User, Video, VideoMatch } from "~/db/types";
import type { MainWeaponId } from "~/modules/in-game-lists";
import type { videoMatchSchema, videoSchema } from "./vods-schemas";

export type VideoBeingAddedPartial = Partial<VideoBeingAdded>;

export type VideoBeingAdded = z.infer<typeof videoSchema>;

export type VideoMatchBeingAdded = z.infer<typeof videoMatchSchema>;

export interface Vod {
	id: Video["id"];
	pov?:
		| Pick<
				User,
				"username" | "discordId" | "discordAvatar" | "customUrl" | "id"
		  >
		| string;
	title: Video["title"];
	type: Video["type"];
	youtubeDate: Video["youtubeDate"];
	youtubeId: Video["youtubeId"];
	matches: Array<VodMatch>;
	submitterUserId: Video["submitterUserId"];
}

export type VodMatch = Pick<
	VideoMatch,
	"id" | "mode" | "stageId" | "startsAt"
> & {
	weapons: Array<MainWeaponId>;
};

export type ListVod = Omit<Vod, "youtubeDate" | "matches"> & {
	weapons: Array<MainWeaponId>;
	type: Video["type"];
};
