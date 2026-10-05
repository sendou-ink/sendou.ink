import { db } from "~/db/sql";
import * as SQGroupRepository from "~/features/sendouq/SQGroupRepository.server";
import { invariant } from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Omit<
	Parameters<typeof SQGroupRepository.insert>[0],
	"userId"
> & {
	/** The group's members, the first of them its creator. */
	memberUserIds: number[];
	/** Members quick added by another member, joining after `memberUserIds`. */
	quickAddedMembers?: Array<{ userId: number; addedByUserId: number }>;
};

type Options = {
	/** Was the group made in the matchmaking UI? */
	isMatchmade?: boolean;
	/** Groups that have liked this one. */
	likedByGroupIds?: number[];
};

/** First of `memberUserIds` is the creator, the rest join like in production. */
export const { create } = defineFactory({
	defaults: () => ({
		status: "ACTIVE" as const,
	}),
	insert: async ({
		memberUserIds,
		quickAddedMembers = [],
		...args
	}: InsertArgs) => {
		const [creatorUserId, ...otherMemberUserIds] = memberUserIds;
		invariant(creatorUserId, "A group needs at least one member");

		const group = await SQGroupRepository.insert({
			...args,
			userId: creatorUserId,
		});

		for (const userId of otherMemberUserIds) {
			await SQGroupRepository.insertMember(group.id, { userId });
		}

		for (const member of quickAddedMembers) {
			await SQGroupRepository.insertMember(group.id, member);
		}

		return {
			id: group.id,
			memberUserIds: [
				...memberUserIds,
				...quickAddedMembers.map((member) => member.userId),
			],
		};
	},
	applyOptions: async (group, { isMatchmade, likedByGroupIds }: Options) => {
		for (const likerGroupId of likedByGroupIds ?? []) {
			const liker = await db
				.selectFrom("GroupMember")
				.select("GroupMember.userId")
				.where("GroupMember.groupId", "=", likerGroupId)
				.executeTakeFirstOrThrow();

			await SQGroupRepository.insertLike({
				likerGroupId,
				targetGroupId: group.id,
				createdByUserId: liker.userId,
			});
		}

		if (isMatchmade) {
			// written directly: the only production write is `morphGroups`, which needs two groups to merge
			await db
				.updateTable("Group")
				.set({ matchmade: 1 })
				.where("id", "=", group.id)
				.execute();
		}
	},
});
