import { beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import type { bracketSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import { invariant } from "~/utils/invariant";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { action } from "./to.$id.brackets.server";

vi.mock("~/features/chat/ChatSystemMessage.server", () => ({
	send: vi.fn(),
	notifyStatusChanged: vi.fn(),
	notifyNotificationsChanged: vi.fn(),
	notifyRoomsChangedByRoomIds: vi.fn(),
}));

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

const SINGLE_SWISS: TournamentSettings["bracketProgression"] = [
	{
		name: "Swiss",
		type: "swiss",
		requiresCheckIn: false,
		settings: { groupCount: 1, roundCount: 3 },
	},
];

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const otherOrganizerId = () => users.id(TEAM_COUNT + 1);

describe("Brackets action UNADVANCE_BRACKET", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT + 1);
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
		const tournament = await createStartedSwissTournament(organizerId());
		const { group, firstRound } = await startedSwissFirstRound(tournament.id);

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

	test("organizer of one tournament cannot delete a round of another tournament", async () => {
		const own = await createStartedSwissTournament(organizerId());
		const other = await createStartedSwissTournament(otherOrganizerId());
		const otherRound = await startedSwissFirstRound(other.id);
		const otherMatchCount = otherRound.matchCount;
		expect(otherMatchCount).toBeGreaterThan(0);

		const response = await bracketsAction(
			{
				_action: "UNADVANCE_BRACKET",
				bracketIdx: 0,
				groupId: otherRound.group.id,
				roundId: otherRound.firstRound.id,
			},
			{ user: organizerId(), params: { id: String(own.id) } },
		);

		assertResponseErrored(response as Response);

		const otherAfter = await startedSwissFirstRound(other.id);
		expect(otherAfter.matchCount).toBe(otherMatchCount);
	});
});

async function createStartedSwissTournament(authorId: number) {
	const tournament = await TournamentFactory.create({
		authorId,
		bracketProgression: SINGLE_SWISS,
		minMembersPerTeam: 1,
	});
	for (const userId of users.ids(TEAM_COUNT)) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [userId] },
			{ isCheckedIn: true },
		);
	}
	await TournamentFactory.startBracket(tournament.id, { bracketIdx: 0 });

	return tournament;
}

async function startedSwissFirstRound(tournamentId: number) {
	const tournament = await tournamentFromDB(tournamentId);
	const swiss = tournament.bracketByIdx(0);
	invariant(swiss && !swiss.preview);
	const group = swiss.data.group[0];
	const firstRound = swiss.data.round.find(
		(round) => round.groupId === group.id && round.number === 1,
	);
	invariant(firstRound);

	return {
		group,
		firstRound,
		matchCount: swiss.data.match.filter(
			(match) => match.roundId === firstRound.id,
		).length,
	};
}
