import * as PlayerStatRepository from "~/features/sendouq-match/PlayerStatRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof PlayerStatRepository.upsertMapResults
>[0][number];

/** A user's map record for one mode and stage of a season. Rows for the same mode, stage and season add up, as reported results do. */
export const { create } = defineFactory({
	defaults: (): Partial<InsertArgs> => ({
		season: 1,
		mode: "SZ",
		stageId: 1,
		wins: 1,
		losses: 0,
	}),
	insert: async (args: InsertArgs) => {
		await PlayerStatRepository.upsertMapResults([args]);

		return args;
	},
});
