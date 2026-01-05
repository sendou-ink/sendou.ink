import { db } from "~/db/sql";
import type { MemberRole, MemberRoleType } from "~/db/tables";

export function bulkUpdateRoster(
	teamId: number,
	members: Array<{
		userId: number;
		role: MemberRole | null;
		customRole: string | null;
		roleType: MemberRoleType | null;
		isManager: boolean;
	}>,
) {
	return db.transaction().execute(async (trx) => {
		for (const [i, member] of members.entries()) {
			await trx
				.updateTable("AllTeamMember")
				.set({
					memberOrder: i,
					role: member.role,
					customRole: member.customRole,
					roleType: member.roleType,
					isManager: member.isManager ? 1 : 0,
				})
				.where("AllTeamMember.teamId", "=", teamId)
				.where("AllTeamMember.userId", "=", member.userId)
				.execute();
		}
	});
}
