import { sql } from "~/db/sql";

const memberTeamIdsStm = sql.prepare(/* sql */ `
  select "TeamMemberWithSecondary"."teamId"
  from "GroupMember"
  left join "TeamMemberWithSecondary" on "TeamMemberWithSecondary"."userId" = "GroupMember"."userId"
  where "groupId" = @groupId
`);

const updateStm = sql.prepare(/* sql */ `
  update "Group"
  set "teamId" = @teamId
  where "id" = @groupId
`);

export function syncGroupTeamId(groupId: number) {
	const teamIds = memberTeamIdsStm
		.all({ groupId })
		.map((row: any) => row.teamId);

	const counts = new Map<number, number>();

	// note if there are multiple teams with 4 members we just choose one of them
	for (const teamId of teamIds) {
		const newCount = (counts.get(teamId) ?? 0) + 1;
		if (newCount === 4) {
			return updateStm.run({ groupId, teamId });
		}

		counts.set(teamId, newCount);
	}

	return updateStm.run({ groupId, teamId: null });
}
