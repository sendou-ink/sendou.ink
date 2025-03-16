import { nanoid } from "nanoid";
import { sql } from "~/db/sql";
import type { GroupMember, User } from "~/db/types";
import { deleteLikesByGroupId } from "./deleteLikesByGroupId.server";

const findToBeDeletedGroupNonRegularsStm = sql.prepare(/* sql */ `
  select "userId"
  from "GroupMember"
  where "groupId" = @groupId
    and "role" != 'REGULAR'
`);

const deleteGroupStm = sql.prepare(/* sql */ `
  delete from "Group"
  where "Group"."id" = @groupId
`);

const updateGroupMemberStm = sql.prepare(/* sql */ `
  update "GroupMember"
  set "role" = @role,
      "groupId" = @newGroupId
  where "groupId" = @oldGroupId
    and "userId" = @userId
`);

const updateGroupStm = sql.prepare(/* sql */ `
  update "Group"
  set "chatCode" = @chatCode
  where "id" = @groupId
`);

export const morphGroups = sql.transaction(
	({
		survivingGroupId,
		otherGroupId,
		newMembers,
	}: {
		survivingGroupId: number;
		otherGroupId: number;
		newMembers: number[];
	}) => {
		const toBeDeletedGroupNonRegulars = findToBeDeletedGroupNonRegularsStm
			.all({ groupId: otherGroupId })
			.map((row: any) => row.userId) as Array<User["id"]>;

		deleteLikesByGroupId(survivingGroupId);

		// reset chat code so previous messages are not visible
		updateGroupStm.run({
			groupId: survivingGroupId,
			chatCode: nanoid(10),
		});

		for (const userId of newMembers) {
			const role: GroupMember["role"] = toBeDeletedGroupNonRegulars.includes(
				userId,
			)
				? "MANAGER"
				: "REGULAR";
			updateGroupMemberStm.run({
				newGroupId: survivingGroupId,
				oldGroupId: otherGroupId,
				userId,
				role,
			});
		}

		deleteGroupStm.run({ groupId: otherGroupId });
	},
);
