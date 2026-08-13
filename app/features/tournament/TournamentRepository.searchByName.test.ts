import { add, sub } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as TournamentRepository from "./TournamentRepository.server";

const QUERY = "In The Zone";

const users = UserFactory.pool();

const createTournament = (name: string, startsAt: Date) =>
	TournamentFactory.create({
		authorId: users.id(1),
		name,
		startTimes: [dateToDatabaseTimestamp(startsAt)],
	});

const search = async (limit = 10) =>
	(await TournamentRepository.searchByName({ query: QUERY, limit })).map(
		(tournament) => tournament.name,
	);

describe("TournamentRepository.searchByName", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("sorts a tournament that is happening right now first", async () => {
		await createTournament(`${QUERY} Tomorrow`, add(new Date(), { days: 1 }));
		await createTournament(`${QUERY} Started`, sub(new Date(), { hours: 3 }));

		expect(await search()).toEqual([`${QUERY} Started`, `${QUERY} Tomorrow`]);
	});

	test("sorts the next tournament up before ones that already happened", async () => {
		await createTournament(`${QUERY} Yesterday`, sub(new Date(), { days: 2 }));
		await createTournament(
			`${QUERY} Next Month`,
			add(new Date(), { days: 30 }),
		);

		expect(await search()).toEqual([
			`${QUERY} Next Month`,
			`${QUERY} Yesterday`,
		]);
	});

	test("sorts the rest by their distance from now", async () => {
		await createTournament(
			`${QUERY} In 3 Weeks`,
			add(new Date(), { weeks: 3 }),
		);
		await createTournament(
			`${QUERY} 2 Weeks Ago`,
			sub(new Date(), { weeks: 2 }),
		);
		await createTournament(
			`${QUERY} In 2 Weeks`,
			add(new Date(), { weeks: 2 }),
		);
		await createTournament(
			`${QUERY} 3 Weeks Ago`,
			sub(new Date(), { weeks: 3 }),
		);

		expect(await search()).toEqual([
			`${QUERY} In 2 Weeks`,
			`${QUERY} 2 Weeks Ago`,
			`${QUERY} In 3 Weeks`,
			`${QUERY} 3 Weeks Ago`,
		]);
	});

	test("keeps the next tournament up in a result set the limit cuts short", async () => {
		await createTournament(`${QUERY} Next Year`, add(new Date(), { years: 1 }));
		await createTournament(`${QUERY} Last Week`, sub(new Date(), { weeks: 1 }));
		await createTournament(
			`${QUERY} Last Month`,
			sub(new Date(), { days: 30 }),
		);

		expect(await search(2)).toEqual([
			`${QUERY} Next Year`,
			`${QUERY} Last Week`,
		]);
	});
});
