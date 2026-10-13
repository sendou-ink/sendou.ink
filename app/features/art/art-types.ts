import type { Tables } from "~/db/tables";
import type { CommonUser } from "~/utils/kysely.server";

export interface ListedArt {
	id: Tables["Art"]["id"];
	createdAt: Tables["Art"]["createdAt"];
	url: Tables["UserSubmittedImage"]["url"];
	description?: Tables["Art"]["description"];
	isShowcase: boolean;
	tags?: Array<{
		id: Tables["ArtTag"]["id"];
		name: Tables["ArtTag"]["name"];
	}>;
	linkedUsers?: Array<CommonUser>;
	author?: {
		id: Tables["User"]["id"];
		username: Tables["User"]["username"];
		avatar: CommonUser["avatar"];
		commissionsOpen: Tables["User"]["commissionsOpen"];
	};
	permissions: {
		EDIT: Array<number>;
		UNLINK: Array<number>;
	};
}

export const ART_SOURCES = ["ALL", "MADE-BY", "MADE-OF"] as const;
export type ArtSource = (typeof ART_SOURCES)[number];
