import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as CalendarEventVenueFactory from "~/db/seed/factories/CalendarEventVenueFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as TournamentStationFactory from "~/db/seed/factories/TournamentStationFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import { createStartedLanTournament } from "../tests/fixtures";
import * as EtaSimulation from "./EtaSimulation";
import * as StationsBoard from "./StationsBoard";
import * as StationsDisplay from "./StationsDisplay";

const users = UserFactory.pool();

const createTournament = (stationNames?: string[]) =>
	createStartedLanTournament({
		authorId: users.id(1),
		teamRosters: R.chunk(users.ids().slice(1), 4),
		stationNames,
		autoAssign: false,
	});

const buildDisplay = async (tournamentId: number) => {
	const tournament = await tournamentFromDB(tournamentId);
	const stations =
		await TournamentStationRepository.findAllByTournamentId(tournamentId);
	const placements =
		await TournamentStationRepository.findMatchPlacementsByTournamentId(
			tournamentId,
		);
	const now = Date.now();

	return {
		tournament,
		display: StationsDisplay.build({
			tournament,
			board: StationsBoard.build({
				tournament,
				stations,
				placements,
				matchStarts: new Map(),
				now,
			}),
			matchStarts: EtaSimulation.simulate({
				tournament,
				stationIds: stations.map((station) => station.id),
				placements,
				now,
			}).matchStarts,
		}),
	};
};

describe("StationsDisplay.build", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("shows each station's now and next match and the waiting matches", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament();
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		await TournamentMatchStationFactory.create({ matchId: finalId, stationId });

		const { display } = await buildDisplay(tournamentId);

		expect(display.stations).toMatchObject([
			{
				name: "Station 1",
				now: {
					id: first,
					sides: [{ type: "TEAM" }, { type: "TEAM" }],
					score: [0, 0],
					eta: null,
				},
				next: {
					id: finalId,
					eta: { earliest: expect.any(Number), latest: expect.any(Number) },
				},
			},
			{ name: "Station 2", now: null, next: null },
		]);
		expect(display.waiting).toMatchObject([
			{ id: second, sides: [{ type: "TEAM" }, { type: "TEAM" }], eta: null },
		]);
	});

	test("names a team not known yet by the match it comes from", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament();
		await TournamentMatchStationFactory.create({ matchId: finalId, stationId });

		const { display, tournament } = await buildDisplay(tournamentId);

		expect(display.stations[0].next?.sides).toEqual([
			{
				type: "WINNER_OF",
				matchName: StationsBoard.matchName(tournament, first),
			},
			{
				type: "WINNER_OF",
				matchName: StationsBoard.matchName(tournament, second),
			},
		]);
	});

	test("names the known team and the match the other one comes from", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament(["Main stage"]);
		await TournamentMatchStationFactory.create({ matchId: finalId, stationId });
		await TournamentFactory.playMatches(tournamentId, { matchIds: [first] });

		const { display, tournament } = await buildDisplay(tournamentId);

		expect(display.stations).toHaveLength(1);
		expect(display.stations[0].next?.sides).toEqual([
			{ type: "TEAM", name: expect.any(String) },
			{
				type: "WINNER_OF",
				matchName: StationsBoard.matchName(tournament, second),
			},
		]);
	});

	test("names the teams of a losers bracket match by the matches they lost", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
			bracketProgression: [
				{
					name: "Bracket",
					type: "double_elimination",
					requiresCheckIn: false,
					settings: {},
				},
			],
		});
		await CalendarEventVenueFactory.create({ eventId: tournament.eventId });
		for (const memberUserIds of R.chunk(users.ids().slice(1), 4)) {
			await TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds },
				{ isCheckedIn: true },
			);
		}
		const station = await TournamentStationFactory.create({
			tournamentId: tournament.id,
			name: "Station 1",
			autoAssign: false,
		});
		await TournamentFactory.startBracket(tournament.id);
		const { data } = (await tournamentFromDB(tournament.id)).brackets[0];
		const firstRoundMatches = (section: "winners" | "losers") => {
			const roundId = data.round.find(
				(round) => round.section === section && round.number === 1,
			)?.id;

			return data.match
				.filter((match) => match.roundId === roundId)
				.toSorted((a, b) => a.number - b.number);
		};
		const [winnersFirst, winnersSecond] = firstRoundMatches("winners");
		const [losersFirst] = firstRoundMatches("losers");
		await TournamentMatchStationFactory.create({
			matchId: losersFirst.id,
			stationId: station.id,
		});

		const { display, tournament: built } = await buildDisplay(tournament.id);

		expect(display.stations[0].next?.sides).toEqual([
			{
				type: "LOSER_OF",
				matchName: StationsBoard.matchName(built, winnersFirst.id),
			},
			{
				type: "LOSER_OF",
				matchName: StationsBoard.matchName(built, winnersSecond.id),
			},
		]);
	});

	test("has no stations when the tournament has none", async () => {
		const { tournamentId } = await createTournament([]);

		const { display } = await buildDisplay(tournamentId);

		expect(display.stations).toEqual([]);
		expect(display.waiting).toHaveLength(2);
	});
});
