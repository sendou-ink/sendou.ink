import * as ArtRepository from "~/features/art/ArtRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof ArtRepository.insert>[0] & {
	authorId: number;
};

/**
 * Creates art.
 *
 * Validated by default, as art uploaded by a patron is, so that the listings
 * reading through the validated-images view can see it.
 */
export const { create, createMany } = defineFactory({
	defaults: ({ seq }) => ({
		url: `art-${seq}.png`,
		validatedAt: databaseTimestampNow(),
		description: null,
		linkedUsers: [] as number[],
		tags: [] as InsertArgs["tags"],
	}),
	insert: ({ authorId, ...args }: InsertArgs) =>
		actAs(authorId, () => ArtRepository.insert(args)),
});
