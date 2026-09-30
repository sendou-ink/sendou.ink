import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof SQGroupRepository.insertLike>[0];

/** One group challenging another, sent by a member of the liker group. */
export const { create } = defineFactory({
	insert: async (args: InsertArgs) => {
		await SQGroupRepository.insertLike(args);

		return args;
	},
});
