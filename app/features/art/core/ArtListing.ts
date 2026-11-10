/**
 * Narrowing down a list of art the way the art pages do: a user's art by whether they made it or are
 * in it and by tag, the tags offered to filter by, artists taking commissions and the page of the
 * grid an art is on. A user's own art comes without an `author` (see `ArtRepository.findArtsByUserId`),
 * art made of them by someone else with one.
 */
import { ART_PER_PAGE } from "../art-constants";
import type { ArtSource, ListedArt } from "../art-types";

type UserArt = Pick<ListedArt, "author" | "tags">;

/**
 * The art of a user's page shown with the source and tag picked. The source only narrows the list
 * when the user has both art they made and art made of them ({@link hasBothSources}), as only then
 * is it offered. A tag narrows it to the art having that tag.
 */
export function filterUserArts<T extends UserArt>(
	arts: T[],
	{ source, tag }: { source: ArtSource; tag: string | null },
) {
	const bySource =
		source === "ALL" || !hasBothSources(arts)
			? arts
			: arts.filter((art) =>
					source === "MADE-BY" ? !art.author : Boolean(art.author),
				);

	if (!tag) return bySource;

	return bySource.filter((art) =>
		art.tags?.some((artTag) => artTag.name === tag),
	);
}

/** Does the user have both art they made and art made of them by someone else? */
export function hasBothSources(arts: UserArt[]) {
	return arts.some((art) => art.author) && arts.some((art) => !art.author);
}

/** Names of the tags of the art with how many pieces have each, most used first. `null` when no art has tags. */
export function tagCounts(arts: Pick<ListedArt, "tags">[]) {
	const counts = new Map<string, number>();
	for (const art of arts) {
		for (const tag of art.tags ?? []) {
			counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1);
		}
	}

	if (counts.size === 0) return null;

	return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

/** The art whose author has their commissions open. */
export function withCommissionsOpen<T extends Pick<ListedArt, "author">>(
	arts: T[],
) {
	return arts.filter((art) => art.author?.commissionsOpen);
}

/**
 * The page of the art grid (`ART_PER_PAGE` pieces each, counting from one) the art is on, so that a
 * shared `?big=` link opens the page containing it. The first page if the art is not in the list.
 */
export function pageOf(arts: Pick<ListedArt, "id">[], artId: number | null) {
	if (artId === null) return 1;

	const index = arts.findIndex((art) => art.id === artId);
	if (index === -1) return 1;

	return Math.floor(index / ART_PER_PAGE) + 1;
}
