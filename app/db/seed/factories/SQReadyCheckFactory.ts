import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<typeof SQGroupRepository.insertReadyCheck>[0];

type Options = {
	/** Members who confirm they are ready right after the check starts. */
	confirmedByUserIds?: number[];
};

/** Both groups have to be active, since a ready check is what takes them out of the looking pool. */
export const { create } = defineFactory({
	insert: (args: InsertArgs) => SQGroupRepository.insertReadyCheck(args),
	applyOptions: async (readyCheck, { confirmedByUserIds }: Options) => {
		for (const userId of confirmedByUserIds ?? []) {
			await SQGroupRepository.insertReadyCheckConfirmation({
				readyCheckId: readyCheck.id,
				userId,
			});
		}
	},
});
