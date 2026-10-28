import { add, sub } from "date-fns";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as LobbyFactory from "../factories/LobbyFactory";
import type { SeededUsers } from "./users";

const RUNNING_LOBBY_PLAYER_COUNT = 10;

/**
 * A running lobby the admin can join late, an upcoming one the admin hosts and one that ended, so the
 * index page has every section and a lobby page has a leaderboard. Users are taken from the crowd the
 * SendouQ seed leaves alone, being active in a lobby and in SendouQ at once isn't possible.
 */
export async function seedLobbies(users: SeededUsers) {
	const pool = users.crowdIds.slice(-140, -110);
	const runningUserIds = pool.slice(0, RUNNING_LOBBY_PLAYER_COUNT);

	await LobbyFactory.create(
		{
			hostUserId: runningUserIds[0],
			name: "Evening 8s",
			label: "FOCUSED",
			startsAt: dateToDatabaseTimestamp(sub(new Date(), { minutes: 40 })),
			roomSize: 10,
		},
		{
			signedUpUserIds: runningUserIds.slice(1),
			checkedInUserIds: runningUserIds,
			playedSetCount: 2,
			reportedMapCount: 1,
		},
	);

	await LobbyFactory.create(
		{
			hostUserId: users.adminId,
			name: "Sendou's 8s",
			startsAt: dateToDatabaseTimestamp(add(new Date(), { hours: 3 })),
		},
		{ signedUpUserIds: pool.slice(10, 17) },
	);

	const endedUserIds = pool.slice(17, 25);
	await LobbyFactory.create(
		{
			hostUserId: endedUserIds[0],
			name: "Tryhard 8s",
			label: "TRYHARD",
			startsAt: dateToDatabaseTimestamp(sub(new Date(), { hours: 5 })),
			bestOf: 5,
		},
		{
			signedUpUserIds: endedUserIds.slice(1),
			checkedInUserIds: endedUserIds,
			playedSetCount: 3,
			isEnded: true,
		},
	);
}
