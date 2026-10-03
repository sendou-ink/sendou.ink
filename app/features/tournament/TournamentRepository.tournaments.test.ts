import { add } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as TournamentRepository from "./TournamentRepository.server";

const users = UserFactory.pool();

const createTournament = (
	args: { isDraft?: boolean; isTest?: boolean; startsAt?: Date } = {},
) =>
	TournamentFactory.create({
		authorId: users.id(1),
		isDraft: args.isDraft,
		isTest: args.isTest,
		startTimes: [dateToDatabaseTimestamp(args.startsAt ?? new Date())],
	});

const idsOf = (rows: Array<{ id: number }>) => rows.map((row) => row.id);

describe("TournamentRepository.tournaments", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("leaves out drafts and test tournaments", async () => {
		const listed = await createTournament();
		await createTournament({ isDraft: true });
		await createTournament({ isTest: true });

		expect(idsOf(await TournamentRepository.tournaments().execute())).toEqual([
			listed.id,
		]);
	});

	test("includingHidden brings drafts and test tournaments back", async () => {
		const listed = await createTournament();
		const draft = await createTournament({ isDraft: true });
		const testTournament = await createTournament({ isTest: true });

		expect(
			idsOf(
				await TournamentRepository.tournaments().includingHidden().execute(),
			),
		).toEqual([listed.id, draft.id, testTournament.id]);
	});

	test("excludingTests keeps drafts of a chain lifting the guard", async () => {
		const draft = await createTournament({ isDraft: true });
		await createTournament({ isTest: true });

		expect(
			idsOf(
				await TournamentRepository.tournaments()
					.includingHidden()
					.excludingTests()
					.execute(),
			),
		).toEqual([draft.id]);
	});

	test("startingBetween excludes its start and includes its end", async () => {
		const now = new Date();
		await createTournament({ startsAt: now });
		const atEnd = await createTournament({ startsAt: add(now, { hours: 1 }) });
		await createTournament({ startsAt: add(now, { hours: 1, seconds: 1 }) });

		expect(
			idsOf(
				await TournamentRepository.tournaments()
					.startingBetween(now, add(now, { hours: 1 }))
					.execute(),
			),
		).toEqual([atEnd.id]);
	});
});
