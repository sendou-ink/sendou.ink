import { beforeEach, describe, expect, test } from "vitest";
import { actAs } from "~/db/seed/core/actAs";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "./TournamentRepository.server";
import * as TournamentTeamRepository from "./TournamentTeamRepository.server";

const MEMBERS_PER_TEAM = 4;
const TEAM_COUNT = 3;

const users = UserFactory.pool();

const createTournament = () =>
	TournamentFactory.create({ authorId: users.id(1) });

const createTournamentTeam = (
	tournamentId: number,
	{ nth, isCheckedIn }: { nth: number; isCheckedIn: boolean },
) =>
	TournamentTeamFactory.create(
		{
			tournamentId,
			memberUserIds: users
				.ids()
				.slice(nth * MEMBERS_PER_TEAM, (nth + 1) * MEMBERS_PER_TEAM),
		},
		{ isCheckedIn },
	);

const showcaseCounts = async (tournamentId: number) => {
	const counts =
		await TournamentRepository.findShowcaseCountsById(tournamentId);
	expect(counts).toBeDefined();

	return counts!;
};

describe("TournamentRepository.findShowcaseCountsById", () => {
	beforeEach(async () => {
		await users.create(MEMBERS_PER_TEAM * TEAM_COUNT);
	});

	test("counts every registered team before a bracket has been started", async () => {
		const { id: tournamentId } = await createTournament();
		await createTournamentTeam(tournamentId, { nth: 0, isCheckedIn: true });
		await createTournamentTeam(tournamentId, { nth: 1, isCheckedIn: true });
		await createTournamentTeam(tournamentId, { nth: 2, isCheckedIn: false });

		const counts = await showcaseCounts(tournamentId);

		expect(counts.teamsCount).toBe(3);
		expect(counts.membersCount).toBe(MEMBERS_PER_TEAM * 3);
	});

	test("counts only checked in teams after a bracket has been started", async () => {
		const { id: tournamentId } = await createTournament();
		await createTournamentTeam(tournamentId, { nth: 0, isCheckedIn: true });
		await createTournamentTeam(tournamentId, { nth: 1, isCheckedIn: true });
		await createTournamentTeam(tournamentId, { nth: 2, isCheckedIn: false });

		await TournamentFactory.startBracket(tournamentId);

		const counts = await showcaseCounts(tournamentId);

		expect(counts.teamsCount).toBe(2);
		expect(counts.membersCount).toBe(MEMBERS_PER_TEAM * 2);
	});

	test("counts a team having several check in rows once", async () => {
		const { id: tournamentId } = await createTournament();
		const team = await createTournamentTeam(tournamentId, {
			nth: 0,
			isCheckedIn: true,
		});
		await createTournamentTeam(tournamentId, { nth: 1, isCheckedIn: true });

		await TournamentFactory.startBracket(tournamentId);
		await actAs(team.ownerUserId, () =>
			TournamentTeamRepository.checkIn(team.id, { bracketIdx: 1 }),
		);

		const counts = await showcaseCounts(tournamentId);

		expect(counts.teamsCount).toBe(2);
		expect(counts.membersCount).toBe(MEMBERS_PER_TEAM * 2);
	});
});
