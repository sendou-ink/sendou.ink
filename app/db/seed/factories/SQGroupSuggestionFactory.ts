import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof SQGroupRepository.insertSuggestion>[0];

/** A group flagged as worth a look by one of the suggester group's own members. */
export const { create } = defineFactory({
	insert: async (args: InsertArgs) => {
		await SQGroupRepository.insertSuggestion(args);

		return args;
	},
});
