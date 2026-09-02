import * as ArtRepository from "~/features/art/ArtRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof ArtRepository.insert>[0] & {
	authorId: number;
};

/** Validated by default (as a patron's upload is) so listings reading the validated-images view see it. */
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
