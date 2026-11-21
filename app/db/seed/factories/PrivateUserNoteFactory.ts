import * as PrivateUserNoteRepository from "~/features/sendouq/PrivateUserNoteRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof PrivateUserNoteRepository.upsertOwnNote
>[0] & {
	/** User writing the note, saving it as they would themselves. */
	authorId: number;
};

/** A private note one user keeps about another. */
export const { create } = defineFactory({
	defaults: () => ({
		sentiment: "NEUTRAL" as const,
		text: null,
	}),
	insert: async ({ authorId, ...args }: InsertArgs) => {
		await actAs(authorId, () => PrivateUserNoteRepository.upsertOwnNote(args));

		return { authorId, targetId: args.targetId };
	},
});
