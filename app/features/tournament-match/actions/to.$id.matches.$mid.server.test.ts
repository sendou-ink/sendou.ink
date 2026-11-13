import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import type { matchSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { createStartedLanTournament } from "~/features/tournament-stations/tests/fixtures";
import { wrappedAction } from "~/utils/Test";
import { action } from "./to.$id.matches.$mid.server";

const matchAction = wrappedAction<typeof matchSchema>({ action });

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
