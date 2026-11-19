import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import { createStartedLanTournament } from "../tests/fixtures";
import { requeueReopenedMatch } from "./requeueReopenedMatch.server";

const users = UserFactory.pool();

const createTournament = () =>
	createStartedLanTournament({
		authorId: users.id(1),
		teamRosters: R.chunk(users.ids().slice(1), 4),
		stationNames: ["Main stage"],
		autoAssign: false,
	});

const requeueAndRead = async (tournamentId: number, matchId: number) => {
	await requeueReopenedMatch({
		tournament: await tournamentFromDB(tournamentId),
		matchId,
	});

	return (
		await TournamentStationRepository.findMatchPlacementsByTournamentId(
			tournamentId,
		)
	).map((placement) => placement.matchId);
};

// the semifinals are playable, the final isn't: as if `first` was just reopened
describe("requeueReopenedMatch", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("puts the match at the front when nothing on its station is playable", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first],
			finalId,
		} = await createTournament();
		for (const matchId of [finalId, first]) {
			await TournamentMatchStationFactory.create({ matchId, stationId });
		}

		expect(await requeueAndRead(tournamentId, first)).toEqual([first, finalId]);
	});

	test("puts the match behind the station's Now match, not behind a match queued in front of it before its teams are known", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament();
		for (const matchId of [first, finalId, second]) {
			await TournamentMatchStationFactory.create({ matchId, stationId });
		}

		expect(await requeueAndRead(tournamentId, first)).toEqual([
			finalId,
			second,
			first,
		]);
	});

	test("leaves a match held in Waiting where it is", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createTournament();
		await TournamentMatchStationFactory.create({
			matchId: second,
			stationId,
		});
		await TournamentMatchStationFactory.create({
			matchId: first,
			stationId: null,
		});

		await requeueAndRead(tournamentId, first);

		expect(
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
		).toEqual([
			{ matchId: first, stationId: null, isAutoAssigned: 0 },
			{ matchId: second, stationId, isAutoAssigned: 0 },
		]);
	});
});
