import { db } from '$lib/server/db/sql';
import type { TablesUpdatable } from '$lib/server/db/tables';

export function update(
	where: { teamId: number; userId: number },
	values: TablesUpdatable['TeamMember']
) {
	return db
		.updateTable('AllTeamMember')
		.set(values)
		.where('AllTeamMember.teamId', '=', where.teamId)
		.where('AllTeamMember.userId', '=', where.userId)
		.execute();
}
