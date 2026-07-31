import { db } from "~/db/sql";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Omit<
	Parameters<typeof SQGroupRepository.insert>[0],
	"userId"
> & {
	/** The group's members, the first of them its owner. */
	memberUserIds: number[];
};

type Options = {
	/** Was the group made in the matchmaking UI? */
	isMatchmade?: boolean;
	/** Groups that have liked this one, each of them as its own owner. */
	likedByGroupIds?: number[];
};

/**
 * Creates SendouQ groups. The first of `memberUserIds` is the owner, whose
 * membership the repository creates with the group; the rest join it the way they do
 * in production. Invite and chat codes are the repository's own.
 */
export const { create } = defineFactory({
	defaults: () => ({
		status: "ACTIVE" as const,
	}),
	insert: async ({ memberUserIds, ...args }: InsertArgs) => {
		const [ownerUserId, ...otherMemberUserIds] = memberUserIds;
		invariant(ownerUserId, "A group needs at least an owner");

		const group = await SQGroupRepository.insert({
			...args,
			userId: ownerUserId,
		});

		for (const userId of otherMemberUserIds) {
			await SQGroupRepository.insertMember(group.id, { userId });
		}

		return { id: group.id, memberUserIds, ownerUserId };
	},
	applyOptions: async (group, { isMatchmade, likedByGroupIds }: Options) => {
		for (const likerGroupId of likedByGroupIds ?? []) {
			await SQGroupRepository.insertLike({
				likerGroupId,
				targetGroupId: group.id,
			});
		}

		if (isMatchmade) {
			// written directly because the only production write of the column is
			// `morphGroups`, which needs two separate groups to merge into one
			await db
				.updateTable("Group")
				.set({ matchmade: 1 })
				.where("id", "=", group.id)
				.execute();
		}
	},
});
