import { sql } from "~/db/sql";

const makeMemberOwnerStm = sql.prepare(/* sql */ `
  update "GroupMember"
    set "role" = 'OWNER'
    where "GroupMember"."groupId" = @groupId
      and "GroupMember"."userId" = @userId
`);

const deleteGroupMemberStm = sql.prepare(/* sql */ `
  delete from "GroupMember"
    where "GroupMember"."groupId" = @groupId
      and "GroupMember"."userId" = @userId
`);

const deleteGroupStm = sql.prepare(/* sql */ `
  delete from "Group"
    where "Group"."id" = @groupId
`);

export const leaveGroup = sql.transaction(
	({
		groupId,
		userId,
		newOwnerId,
		wasOwner,
	}: {
		groupId: number;
		userId: number;
		newOwnerId: number | null;
		wasOwner: boolean;
	}) => {
		if (!wasOwner) {
			deleteGroupMemberStm.run({ groupId, userId });
			return;
		}

		if (newOwnerId) {
			makeMemberOwnerStm.run({ groupId, userId: newOwnerId });
			deleteGroupMemberStm.run({ groupId, userId });
		} else {
			deleteGroupStm.run({ groupId });
		}
	},
);
