import { sql } from "~/db/sql";
import { parseDBJsonArray } from "~/utils/sql";
import type { LookingGroupWithInviteCode } from "../q-types";

const stm = sql.prepare(/* sql */ `
  with "q1" as (
    select
      "Group"."id",
      "Group"."createdAt",
      "Group"."inviteCode",
      "User"."id" as "userId",
      "User"."discordId",
      "User"."username",
      "User"."discordAvatar",
      "User"."qWeaponPool",
      "GroupMember"."role",
      "GroupMember"."note"
    from
      "Group"
    left join "GroupMember" on "GroupMember"."groupId" = "Group"."id"
    left join "User" on "User"."id" = "GroupMember"."userId"
    left join "GroupMatch" on "GroupMatch"."alphaGroupId" = "Group"."id"
      or "GroupMatch"."bravoGroupId" = "Group"."id"
    where
      "Group"."id" = @ownGroupId
      and "Group"."status" = 'PREPARING'
  )
  select 
    "q1"."id",
    "q1"."inviteCode",
    "q1"."createdAt",
    json_group_array(
      json_object(
        'id', "q1"."userId",
        'discordId', "q1"."discordId",
        'username', "q1"."username",
        'discordAvatar', "q1"."discordAvatar",
        'role', "q1"."role",
        'note', "q1"."note",
        'qWeaponPool', "q1"."qWeaponPool"
      )
    ) as "members"
  from "q1"
  group by "q1"."id"
  order by "q1"."createdAt" desc
`);

export function findPreparingGroup(
	ownGroupId: number,
): LookingGroupWithInviteCode {
	const row = stm.get({ ownGroupId }) as any;

	return {
		id: row.id,
		createdAt: row.createdAt,
		chatCode: null,
		inviteCode: row.inviteCode,
		members: parseDBJsonArray(row.members).map((member: any) => {
			const weapons = member.qWeaponPool ? JSON.parse(member.qWeaponPool) : [];

			return {
				...member,
				weapons: weapons.length > 0 ? weapons : undefined,
			};
		}),
	};
}
