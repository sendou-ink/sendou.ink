import { db } from "~/db/sql";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { defineFactory } from "../core/defineFactory";

type Insert = typeof SQGroupRepository.insert;

type InsertArgs = Parameters<Insert>[0] & {
	additionalMemberUserIds: number[];
};

type Options = {
	/** Was the group made in the matchmaking UI? */
	isMatchmade: boolean;
};

/**
 * Creates SendouQ groups. `userId` is the owner, whose membership the repository
 * creates with the group; the members named by `additionalMemberUserIds` join it
 * the way they do in production. Invite and chat codes are the repository's own.
 */
export const { create } = defineFactory({
	defaults: () => ({
		status: "ACTIVE" as const,
		additionalMemberUserIds: [],
	}),
	insert: async ({ additionalMemberUserIds, ...args }: InsertArgs) => {
		const group = await SQGroupRepository.insert(args);

		for (const userId of additionalMemberUserIds) {
			await SQGroupRepository.insertMember(group.id, { userId });
		}

		return group;
	},
	applyOptions: async (group, { isMatchmade }: Options) => {
		if (!isMatchmade) return;

		await db
			.updateTable("Group")
			.set({ matchmade: 1 })
			.where("id", "=", group.id)
			.execute();
	},
});
