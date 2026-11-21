import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import type { matchSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { createStartedLanTournament } from "~/features/tournament-stations/tests/fixtures";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { action } from "./to.$id.matches.$mid.server";

const matchAction = wrappedAction<typeof matchSchema>({ action });
const jsonMatchAction = wrappedAction<typeof matchSchema>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();
const organizerId = () => users.id(1);

describe("Match action REPORT_SCORE", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("puts the next playable match on the station the finished set freed", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createStartedLanTournament({
			authorId: organizerId(),
			teamRosters: R.chunk(users.ids().slice(1), 4),
			stationNames: ["Main stage"],
		});
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		const winnerTeamId = (
			await tournamentFromDB(tournamentId)
		).brackets[0].data.match.find((match) => match.id === first)?.opponent1?.id;
		if (!winnerTeamId) throw new Error("Semifinal has no team");

		for (const position of [0, 1]) {
			await matchAction(
				{ _action: "REPORT_SCORE", winnerTeamId, position },
				{
					user: organizerId(),
					params: { id: String(tournamentId), mid: String(first) },
				},
			);
		}

		expect(
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
		).toEqual([
			{ matchId: first, stationId, isAutoAssigned: 0 },
			{ matchId: second, stationId, isAutoAssigned: 1 },
		]);
	});
});

describe("Match action REOPEN_MATCH", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("queues the reopened match behind the one played on its station now", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createStartedLanTournament({
			authorId: organizerId(),
			teamRosters: R.chunk(users.ids().slice(1), 4),
			stationNames: ["Main stage"],
			autoAssign: false,
		});
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		await TournamentMatchStationFactory.create({ matchId: second, stationId });
		const winnerTeamId = (
			await tournamentFromDB(tournamentId)
		).brackets[0].data.match.find((match) => match.id === first)?.opponent1?.id;
		if (!winnerTeamId) throw new Error("Semifinal has no team");
		const firstParams = { id: String(tournamentId), mid: String(first) };

		for (const position of [0, 1]) {
			await matchAction(
				{ _action: "REPORT_SCORE", winnerTeamId, position },
				{ user: organizerId(), params: firstParams },
			);
		}
		await matchAction(
			{ _action: "REOPEN_MATCH" },
			{ user: organizerId(), params: firstParams },
		);

		expect(
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
		).toEqual([
			{ matchId: second, stationId, isAutoAssigned: 0 },
			{ matchId: first, stationId, isAutoAssigned: 0 },
		]);
	});
});

describe("Match action LOCK", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("rejects locking a LAN match to be casted", async () => {
		const { tournamentId, finalId } = await createStartedLanTournament({
			authorId: organizerId(),
			teamRosters: R.chunk(users.ids().slice(1), 4),
		});

		const response = await jsonMatchAction(
			{
				_action: "LOCK",
				castAccount: { platform: "TWITCH", account: "lan_stream" },
			},
			{
				user: organizerId(),
				params: { id: String(tournamentId), mid: String(finalId) },
			},
		);

		assertResponseErrored(response, "LAN matches can't be locked");
		expect(
			(await tournamentFromDB(tournamentId)).ctx.castedMatchesInfo
				?.lockedMatches ?? [],
		).toEqual([]);
	});
});
