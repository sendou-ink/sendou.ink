import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	notifyRoomsChangedByRoomIds: vi.fn(),
}));

import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import type { bracketSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import invariant from "~/utils/invariant";
import { wrappedAction } from "~/utils/Test";
import { action } from "./to.$id.brackets.server";

const bracketsAction = wrappedAction<typeof bracketSchema>({
	action,
	isJsonSubmission: true,
});

const TEAM_COUNT = 8;

/** Two pools of four, the top two of each pool advancing to a single group swiss. */
const POOLS_TO_SWISS: TournamentSettings["bracketProgression"] = [
	{
		name: "Pools",
		type: "round_robin",
		requiresCheckIn: false,
		settings: { teamsPerGroup: 4 },
	},
	{
		name: "Swiss",
		type: "swiss",
		requiresCheckIn: false,
		settings: { groupCount: 1, roundCount: 3 },
		sources: [{ bracketIdx: 0, placements: [1, 2] }],
	},
];

const users = UserFactory.pool();
const organizerId = () => users.id(1);

describe("Brackets action UNADVANCE_BRACKET", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT);
	});

	test("deletes a swiss round of a follow-up swiss bracket whose own follow-ups have not started", async () => {
		const tournament = await TournamentFactory.createPlayed(
			{
				authorId: organizerId(),
				bracketProgression: POOLS_TO_SWISS,
				minMembersPerTeam: 1,
			},
			{
				teamRosters: users.ids(TEAM_COUNT).map((userId) => [userId]),
				playedOut: 0,
			},
		);
		await TournamentFactory.startBracket(tournament.id, { bracketIdx: 1 });

		const before = await tournamentFromDB(tournament.id);
		const swiss = before.bracketByIdx(1);
		invariant(swiss && !swiss.preview);
		const group = swiss.data.group[0];
		const firstRound = swiss.data.round.find(
			(round) => round.groupId === group.id && round.number === 1,
		);
		invariant(firstRound);
		expect(
			swiss.data.match.filter((match) => match.roundId === firstRound.id)
				.length,
		).toBeGreaterThan(0);

		const response = await bracketsAction(
			{
				_action: "UNADVANCE_BRACKET",
				bracketIdx: 1,
				groupId: group.id,
				roundId: firstRound.id,
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			response instanceof Response ? response.headers.get("Location") : null,
		).toBeNull();

		const after = await tournamentFromDB(tournament.id);
		const swissAfter = after.bracketByIdx(1);
		invariant(swissAfter);
		expect(
			swissAfter.data.match.filter((match) => match.roundId === firstRound.id),
		).toHaveLength(0);
	});

	test("deletes a swiss round of a starting swiss bracket", async () => {
		const tournament = await TournamentFactory.create({
			authorId: organizerId(),
			bracketProgression: [
				{
					name: "Swiss",
					type: "swiss",
					requiresCheckIn: false,
					settings: { groupCount: 1, roundCount: 3 },
				},
			],
			minMembersPerTeam: 1,
		});
		for (const userId of users.ids(TEAM_COUNT)) {
			await TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds: [userId] },
				{ isCheckedIn: true },
			);
		}
		await TournamentFactory.startBracket(tournament.id, { bracketIdx: 0 });

		const before = await tournamentFromDB(tournament.id);
		const swiss = before.bracketByIdx(0);
		invariant(swiss && !swiss.preview);
		const group = swiss.data.group[0];
		const firstRound = swiss.data.round.find(
			(round) => round.groupId === group.id && round.number === 1,
		);
		invariant(firstRound);

		const response = await bracketsAction(
			{
				_action: "UNADVANCE_BRACKET",
				bracketIdx: 0,
				groupId: group.id,
				roundId: firstRound.id,
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			response instanceof Response ? response.headers.get("Location") : null,
		).toBeNull();
	});
});
