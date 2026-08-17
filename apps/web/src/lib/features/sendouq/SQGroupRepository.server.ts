import { sql } from "kysely";
import { userIsBanned } from "#lib/features/ban/banned.server.ts";
import { db } from "#lib/server/db/sql.ts";
import { commonUserSelect } from "#lib/server/kysely.ts";

export async function findFriendsAndTeammates(userId: number) {
	const teams = await db
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("Team", "Team.id", "TeamMemberWithSecondary.teamId")
		.select(["Team.id", "Team.name", "TeamMemberWithSecondary.isMainTeam"])
		.where("userId", "=", userId)
		.execute();

	const rows = await db
		.selectFrom("TeamMemberWithSecondary")
		.innerJoin("User", "User.id", "TeamMemberWithSecondary.userId")
		.select((eb) => [
			...commonUserSelect(eb),
			"User.inGameName",
			// cast: the unioned friends branch selects null as teamId
			eb.ref("TeamMemberWithSecondary.teamId").$castTo<number | null>().as("teamId"),
		])
		.where(
			"TeamMemberWithSecondary.teamId",
			"in",
			teams.map((t) => t.id),
		)
		.union((eb) =>
			eb
				.selectFrom("Friendship")
				.innerJoin("User", (join) =>
					join.on((eb) =>
						eb.or([
							eb.and([
								eb("Friendship.userOneId", "=", userId),
								eb("User.id", "=", eb.ref("Friendship.userTwoId")),
							]),
							eb.and([
								eb("Friendship.userTwoId", "=", userId),
								eb("User.id", "=", eb.ref("Friendship.userOneId")),
							]),
						]),
					),
				)
				.select((eb) => [
					...commonUserSelect(eb),
					"User.inGameName",
					sql<number | null>`null`.as("teamId"),
				]),
		)
		.execute();

	// the React app's userIsBanned is sync; here the banned cache read is async
	const bannedFlags = await Promise.all(
		rows.map((row) => userIsBanned(row.id)),
	);
	const rowsWithoutBanned = rows.filter((_, index) => !bannedFlags[index]);

	const teamMemberIds = rowsWithoutBanned
		.filter((row) => row.teamId)
		.map((row) => row.id);

	// we want user to show twice if member of two different teams
	// but we don't want a user from the team to show in teamless section
	const deduplicatedRows = rowsWithoutBanned.filter(
		(row) => row.teamId || !teamMemberIds.includes(row.id),
	);

	// done here at not sql just because it was easier to do here ignoring case
	deduplicatedRows.sort((a, b) => a.username.localeCompare(b.username));

	return {
		teams: teams.sort((a, b) => b.isMainTeam - a.isMainTeam),
		friends: deduplicatedRows,
	};
}
