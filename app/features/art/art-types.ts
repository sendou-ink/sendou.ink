import type { QueryRow } from "~/db/entity-query";
import type * as ArtRepository from "./ArtRepository.server";

type Arts = ReturnType<typeof ArtRepository.arts>;
type ArtWithAuthor = QueryRow<ReturnType<Arts["withAuthor"]>>;
type ArtDetails = Pick<
	QueryRow<
		ReturnType<
			ReturnType<
				ReturnType<Arts["withTags"]>["withLinkedUsers"]
			>["withPermissions"]
		>
	>,
	"tags" | "linkedUsers" | "permissions"
>;

/** Art as a grid lists it. The user page's grid also shows its tags, tagged users and permissions. */
export type ListedArt = ArtWithAuthor & Partial<ArtDetails>;

export const ART_SOURCES = ["ALL", "MADE-BY", "MADE-OF"] as const;
export type ArtSource = (typeof ART_SOURCES)[number];
