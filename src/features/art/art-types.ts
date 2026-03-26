import type { Tables } from "~/db/tables";

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
	linkedUsers?: Array<{
		id: Tables["User"]["id"];
		discordId: Tables["User"]["discordId"];
		username: Tables["User"]["username"];
		customUrl: Tables["User"]["customUrl"];
	}>;
	author?: {
		discordId: Tables["User"]["discordId"];
		username: Tables["User"]["username"];
		discordAvatar: Tables["User"]["discordAvatar"];
		commissionsOpen?: Tables["User"]["commissionsOpen"];
	};
}

export const ART_SOURCES = ["ALL", "MADE-BY", "MADE-OF"] as const;
export type ArtSource = (typeof ART_SOURCES)[number];
