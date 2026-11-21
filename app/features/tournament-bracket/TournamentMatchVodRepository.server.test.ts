import { subDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as TournamentMatchVodRepository from "./TournamentMatchVodRepository.server";

const users = UserFactory.pool();

describe("TournamentMatchVodRepository.findTournamentsNeedingVodSync", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	const createTournament = ({
		startedDaysAgo,
		isFinalized = true,
	}: {
		startedDaysAgo: number;
		isFinalized?: boolean;
	}) =>
		TournamentFactory.createPlayed(
			{
				authorId: users.id(1),
				startTimes: [
					dateToDatabaseTimestamp(subDays(new Date(), startedDaysAgo)),
				],
				minMembersPerTeam: 1,
			},
			{
				teamRosters: [[users.id(1)], [users.id(2)]],
				playedOut: isFinalized ? "all" : 0,
			},
		);

	const tournamentIdsNeedingSync = async () =>
		(await TournamentMatchVodRepository.findTournamentsNeedingVodSync()).map(
			(tournament) => tournament.id,
		);

	test("includes a never synced tournament finalized days after it started", async () => {
		const { id } = await createTournament({ startedDaysAgo: 3 });

		expect(await tournamentIdsNeedingSync()).toContain(id);
	});

	test("excludes a tournament whose VoDs are no longer shown", async () => {
		const { id } = await createTournament({ startedDaysAgo: 8 });

		expect(await tournamentIdsNeedingSync()).not.toContain(id);
	});

	test("excludes a tournament that is not finalized", async () => {
		const { id } = await createTournament({
			startedDaysAgo: 0,
			isFinalized: false,
		});

		expect(await tournamentIdsNeedingSync()).not.toContain(id);
	});

	test("excludes a tournament synced moments ago", async () => {
		const { id } = await createTournament({ startedDaysAgo: 3 });
		await TournamentMatchVodRepository.markVodSyncCompleted(id);

		expect(await tournamentIdsNeedingSync()).not.toContain(id);
	});
});
