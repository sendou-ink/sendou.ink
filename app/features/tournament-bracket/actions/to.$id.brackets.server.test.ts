import { beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TournamentSettings } from "~/db/tables-json";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import type { RoundData } from "~/features/tournament-bracket/core/engine/types";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import type { bracketSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import type { ModeShort } from "~/modules/in-game-lists/types";
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

/** The dialog submits its switches as checkbox values, the schema turns them into booleans. */
const checkboxValue = (isChecked: boolean) =>
	(isChecked ? "on" : "off") as unknown as boolean;

const RANKED_MODE_ORDER: ModeShort[] = ["SZ", "TC", "RM"];
/** Any fixed point in time works. */
const PLAYABLE_AT = 1_800_000_000;
/** Turf War is not among the ranked modes a default team picked tournament plays. */
const MODE_ORDER_WITH_UNPLAYED_MODE: ModeShort[] = ["SZ", "TW", "TC"];

describe("Brackets action START_BRACKET", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT);
	});

	test("rejects a mode order with a mode the tournament does not play", async () => {
		const tournament = await createTeamPickedTournament(organizerId());
		const rounds = await previewRounds(tournament.id);

		const response = await bracketsAction(
			{
				_action: "START_BRACKET",
				bracketIdx: 0,
				thirdPlaceMatchLinked: false,
				isRealtime: false,
				maps: rounds.map((round) =>
					teamPickedRoundMaps(round, MODE_ORDER_WITH_UNPLAYED_MODE),
				),
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		assertResponseErrored(
			response as Response,
			"Mode order includes a mode not played in the tournament",
		);

		const after = await tournamentFromDB(tournament.id);
		expect(after.bracketByIdx(0)?.preview).toBe(true);
	});

	test("starts a team picked bracket with the mode order of every round", async () => {
		const tournament = await createTeamPickedTournament(organizerId());
		const rounds = await previewRounds(tournament.id);

		const response = await bracketsAction(
			{
				_action: "START_BRACKET",
				bracketIdx: 0,
				thirdPlaceMatchLinked: false,
				isRealtime: false,
				maps: rounds.map((round) =>
					teamPickedRoundMaps(round, RANKED_MODE_ORDER),
				),
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			response instanceof Response ? response.headers.get("Location") : null,
		).toBeNull();

		const after = await tournamentFromDB(tournament.id);
		const bracket = after.bracketByIdx(0);
		invariant(bracket && !bracket.preview);
		expect(bracket.data.round.length).toBe(rounds.length);
		for (const round of bracket.data.round) {
			expect(round.maps?.modes).toEqual(RANKED_MODE_ORDER);
			expect(round.maps?.list).toBeFalsy();
		}
	});

	test.each([
		{ isRealtime: false, hasScheduling: true, isPlayableAt: PLAYABLE_AT },
		{ isRealtime: true, hasScheduling: false, isPlayableAt: null },
	])(
		"starts a league bracket with isRealtime $isRealtime",
		async ({ isRealtime, hasScheduling, isPlayableAt }) => {
			const tournament = await createTeamPickedTournament(organizerId(), {
				isLeague: true,
			});
			const rounds = await previewRounds(tournament.id);

			await bracketsAction(
				{
					_action: "START_BRACKET",
					bracketIdx: 0,
					thirdPlaceMatchLinked: false,
					isRealtime: checkboxValue(isRealtime),
					maps: rounds.map((round) => ({
						...teamPickedRoundMaps(round, RANKED_MODE_ORDER),
						isPlayableAt: PLAYABLE_AT,
					})),
				},
				{ user: organizerId(), params: { id: String(tournament.id) } },
			);

			const bracket = (await tournamentFromDB(tournament.id)).bracketByIdx(0);
			invariant(bracket && !bracket.preview);
			expect(bracket.hasScheduling).toBe(hasScheduling);
			for (const round of bracket.data.round) {
				expect(round.isPlayableAt).toBe(isPlayableAt);
			}
		},
	);
});

describe("Brackets action PREPARE_MAPS", () => {
	beforeEach(async () => {
		await users.create(TEAM_COUNT);
	});

	test("rejects a mode order with a mode the tournament does not play", async () => {
		const tournament = await createTeamPickedTournament(organizerId());
		const rounds = await previewRounds(tournament.id);

		const response = await bracketsAction(
			{
				_action: "PREPARE_MAPS",
				bracketIdx: 0,
				thirdPlaceMatchLinked: false,
				eliminationTeamCount: undefined,
				maps: rounds.map((round) =>
					teamPickedRoundMaps(round, MODE_ORDER_WITH_UNPLAYED_MODE),
				),
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		assertResponseErrored(
			response as Response,
			"Mode order includes a mode not played in the tournament",
		);
		expect(
			await TournamentRepository.findPreparedMapsById(tournament.id),
		).toBeUndefined();
	});

	test("saves the prepared mode orders of a team picked bracket", async () => {
		const tournament = await createTeamPickedTournament(organizerId());
		const rounds = await previewRounds(tournament.id);

		const response = await bracketsAction(
			{
				_action: "PREPARE_MAPS",
				bracketIdx: 0,
				thirdPlaceMatchLinked: false,
				eliminationTeamCount: undefined,
				maps: rounds.map((round) =>
					teamPickedRoundMaps(round, RANKED_MODE_ORDER),
				),
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			response instanceof Response ? response.headers.get("Location") : null,
		).toBeNull();

		const prepared = await TournamentRepository.findPreparedMapsById(
			tournament.id,
		);
		expect(prepared?.[0]?.maps.map((round) => round.modes)).toEqual(
			rounds.map(() => RANKED_MODE_ORDER),
		);
	});
});

/** Single elimination tournament whose teams pick their own maps, every team checked in and ready to start. */
async function createTeamPickedTournament(
	authorId: number,
	options?: { isLeague?: boolean },
) {
	const tournament = await TournamentFactory.create(
		{
			authorId,
			minMembersPerTeam: 1,
			mapPickingStyle: "AUTO",
		},
		options,
	);
	for (const userId of users.ids(TEAM_COUNT)) {
		await TournamentTeamFactory.create(
			{ tournamentId: tournament.id, memberUserIds: [userId] },
			{ isCheckedIn: true },
		);
	}

	return tournament;
}

async function previewRounds(tournamentId: number) {
	const tournament = await tournamentFromDB(tournamentId);
	const bracket = tournament.bracketByIdx(0);
	invariant(bracket?.preview, "expected the bracket to not be started yet");

	return bracket.data.round;
}

function teamPickedRoundMaps(
	round: { id: number; section: RoundData["section"] },
	modes: ModeShort[],
) {
	return {
		roundId: round.id,
		section: round.section,
		count: 3 as const,
		type: "BEST_OF" as const,
		list: null,
		modes,
		pickBan: null,
		customFlow: null,
	};
}
