import type { Art, User, UserSubmittedImage } from "~/db/types";

export interface ListedArt {
	id: Art["id"];
	createdAt: Art["createdAt"];
	url: UserSubmittedImage["url"];
	description?: Art["description"];
	tags?: string[];
	linkedUsers?: Array<{
		discordId: User["discordId"];
		username: User["username"];
		customUrl: User["customUrl"];
	}>;
	author?: {
		discordId: User["discordId"];
		username: User["username"];
		discordAvatar: User["discordAvatar"];
		commissionsOpen?: User["commissionsOpen"];
	};
}

export const ART_SOURCES = ["ALL", "MADE-BY", "MADE-OF"] as const;
export type ArtSource = (typeof ART_SOURCES)[number];
