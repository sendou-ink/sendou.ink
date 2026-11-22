import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { createStartedLanTournament } from "~/features/tournament-stations/tests/fixtures";
import { wrappedAction } from "~/utils/Test";
import type { adminBracketsActionSchema } from "../tournament-admin-schemas";
import { action } from "./to.$id.admin.brackets.server";

const bracketsAction = wrappedAction<typeof adminBracketsActionSchema>({
	action,
});

const division = (name: string) => ({
	name,
	type: "single_elimination" as const,
	requiresCheckIn: false,
	settings: { skippedRounds: ["THIRD_PLACE_MATCH" as const] },
});

const DIVISIONS: TournamentSettings["bracketProgression"] = [
	division("Division 1"),
	division("Division 2"),
	division("Division 3"),
];

const users = UserFactory.pool();
const organizerId = () => users.id(1);

describe("UPDATE_TOURNAMENT_PROGRESSION", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test.each([
		{
			why: "a division added",
			bracketProgression: [...DIVISIONS, division("Division 4")],
		},
		{
			why: "a division removed",
			bracketProgression: [DIVISIONS[0], DIVISIONS[2]],
		},
		{
			why: "a division inserted before another",
			bracketProgression: [
				DIVISIONS[0],
				division("Division 1.5"),
				DIVISIONS[1],
				DIVISIONS[2],
			],
		},
		{
			why: "a division turned into a follow-up bracket",
			bracketProgression: [
				DIVISIONS[0],
				DIVISIONS[1],
				{ ...DIVISIONS[2], sources: [{ bracketIdx: 1, placements: [1] }] },
			],
		},
	])(
		"rejects $why after the tournament started",
		async ({ bracketProgression }) => {
			const tournamentId = await createStartedDivisionsTournament();

			await updateProgression(tournamentId, bracketProgression);

			const tournament = await tournamentFromDB(tournamentId);
			expect(tournament.ctx.settings.bracketProgression).toEqual(DIVISIONS);
		},
	);

	test("accepts editing an unstarted division's format after the tournament started", async () => {
		const tournamentId = await createStartedDivisionsTournament();
		const bracketProgression = [
			DIVISIONS[0],
			{ ...DIVISIONS[1], settings: { skippedRounds: [] } },
			DIVISIONS[2],
		];

		await updateProgression(tournamentId, bracketProgression);

		const tournament = await tournamentFromDB(tournamentId);
		expect(tournament.ctx.settings.bracketProgression).toEqual(
			bracketProgression,
		);
	});
});

describe("UPDATE_BRACKET_ORDER", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("saves the order the brackets are shown in", async () => {
		const tournamentId = await createStartedDivisionsTournament();

		await updateBracketOrder(tournamentId, [2, 0, 1]);

		const tournament = await tournamentFromDB(tournamentId);
		expect(
			tournament
				.visibleBracketsMetaOfDivision(null)
				.map((bracket) => bracket.name),
		).toEqual(["Division 3", "Division 1", "Division 2"]);
	});

	test.each([
		{ why: "a bracket missing", bracketOrder: [2, 0] },
		{ why: "a bracket twice", bracketOrder: [2, 0, 0] },
	])("rejects an order with $why", async ({ bracketOrder }) => {
		const tournamentId = await createStartedDivisionsTournament();

		await updateBracketOrder(tournamentId, bracketOrder);

		const tournament = await tournamentFromDB(tournamentId);
		expect(tournament.ctx.settings.bracketOrder).toBeUndefined();
	});

	test("keeps the order of the remaining brackets when one is removed", async () => {
		const groups = division("Groups");
		const topCut = {
			...division("Top cut"),
			sources: [{ bracketIdx: 0, placements: [1] }],
		};
		const underground = {
			...division("Underground"),
			sources: [{ bracketIdx: 0, placements: [2] }],
		};
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			bracketProgression: [groups, underground, topCut],
		});
		await updateBracketOrder(tournament.id, [2, 0, 1]);

		await updateProgression(tournament.id, [
			groups,
			{ ...topCut, sources: [{ bracketIdx: 0, placements: [1] }] },
		]);

		expect(
			(await tournamentFromDB(tournament.id))
				.visibleBracketsMetaOfDivision(null)
				.map((bracket) => bracket.name),
		).toEqual(["Top cut", "Groups"]);
	});
});

describe("brackets action in a LAN", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("puts the playable matches on the free stations", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId, secondStationId],
			semifinalIds: [first, second],
		} = await createStartedLanTournament({
			authorId: organizerId(),
			teamRosters: R.chunk(users.ids().slice(1), 4),
		});

		await updateProgression(
			tournamentId,
			(await tournamentFromDB(tournamentId)).ctx.settings.bracketProgression,
		);

		expect(
			await TournamentStationRepository.findMatchPlacementsByTournamentId(
				tournamentId,
			),
		).toEqual([
			{ matchId: first, stationId: firstStationId, isAutoAssigned: 1 },
			{ matchId: second, stationId: secondStationId, isAutoAssigned: 1 },
		]);
	});
});

async function createStartedDivisionsTournament() {
	const tournament = await TournamentFactory.create({
		authorId: organizerId(),
		bracketProgression: DIVISIONS,
		minMembersPerTeam: 1,
	});

	for (const userId of users.ids(2)) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [userId] },
			{ isCheckedIn: true, startingBracketIdx: 0 },
		);
	}

	await TournamentFactory.startBracket(tournament.id, { bracketIdx: 0 });

	return tournament.id;
}

function updateProgression(
	tournamentId: number,
	bracketProgression: TournamentSettings["bracketProgression"],
) {
	return bracketsAction(
		{
			_action: "UPDATE_TOURNAMENT_PROGRESSION",
			bracketProgression: JSON.stringify(bracketProgression) as any,
		},
		{ user: organizerId(), params: { id: String(tournamentId) } },
	);
}

function updateBracketOrder(tournamentId: number, bracketOrder: number[]) {
	return bracketsAction(
		{
			_action: "UPDATE_BRACKET_ORDER",
			bracketOrder: JSON.stringify(bracketOrder) as any,
		},
		{ user: organizerId(), params: { id: String(tournamentId) } },
	);
}
