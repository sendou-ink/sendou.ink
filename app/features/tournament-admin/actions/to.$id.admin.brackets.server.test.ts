import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
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
