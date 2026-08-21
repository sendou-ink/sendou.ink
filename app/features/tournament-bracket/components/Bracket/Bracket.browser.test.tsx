import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import type { Bracket as BracketType } from "../../core/Bracket";
import { EliminationBracketSide } from "./Elimination";
import { Bracket } from "./index";
import { RoundRobinBracket } from "./RoundRobin";
import { SwissBracket } from "./Swiss";

const mockTournament = {
	ctx: {
		id: 1,
		name: "Test Tournament",
		isFinalized: 0,
		castedMatchesInfo: null,
		teams: [
			{
				id: 1,
				name: "Team Alpha",
				seed: 1,
				members: [{ userId: 1, username: "Player1" }],
				droppedOut: 0,
			},
			{
				id: 2,
				name: "Team Beta",
				seed: 2,
				members: [{ userId: 2, username: "Player2" }],
				droppedOut: 0,
			},
			{
				id: 3,
				name: "Team Gamma",
				seed: 3,
				members: [{ userId: 3, username: "Player3" }],
				droppedOut: 0,
			},
			{
				id: 4,
				name: "Team Delta",
				seed: 4,
				members: [{ userId: 4, username: "Player4" }],
				droppedOut: 0,
			},
			{
				id: 5,
				name: "Team Epsilon",
				seed: 5,
				members: [{ userId: 5, username: "Player5" }],
				droppedOut: 0,
			},
			{
				id: 6,
				name: "Team Zeta",
				seed: 6,
				members: [{ userId: 6, username: "Player6" }],
				droppedOut: 0,
			},
			{
				id: 7,
				name: "Team Eta",
				seed: 7,
				members: [{ userId: 7, username: "Player7" }],
				droppedOut: 0,
			},
			{
				id: 8,
				name: "Team Theta",
				seed: 8,
				members: [{ userId: 8, username: "Player8" }],
				droppedOut: 0,
			},
		],
		settings: {
			bracketProgression: [
				{
					name: "Main Bracket",
					type: "double_elimination",
					requiresCheckIn: false,
					settings: {},
				},
			],
		},
		bracketProgressionOverrides: [],
	},
	participatedUserIds: [1, 2, 3, 4, 5, 6, 7, 8],
	streamingParticipantIds: [],
	brackets: [],
	bracketsMeta: [],
	bracketMetaByIdx: () => null,
	isLeague: false,
	teamById: (id: number) =>
		mockTournament.ctx.teams.find((t) => t.id === id) ?? null,
	teamMemberOfByUser: () => null,
	isOrganizer: () => false,
};

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

vi.mock("~/features/tournament/tournament-context", () => ({
	useTournament: () => mockTournament,
}));

vi.mock("~/features/tournament/routes/to.$id", () => ({
	useTournamentVods: () => [],
	useBracketExpanded: () => ({
		bracketExpanded: true,
		setBracketExpanded: vi.fn(),
	}),
	useStreamingParticipants: () => [],
}));

function createSingleEliminationData(): BracketData {
	return {
		stage: [
			{
				id: 1,
				name: "Main Bracket",
				number: 1,
				type: "single_elimination",
				settings: {},
			},
		],
		group: [{ id: 1, number: 1, stageId: 1 }],
		round: [
			{
				id: 1,
				groupId: 1,
				number: 1,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				groupId: 1,
				number: 2,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				groupId: 1,
				number: 3,
				stageId: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			{
				id: 1,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 1, score: 2 },
				opponent2: { id: 8, score: 0 },
				winnerSide: "opponent1",
			},
			{
				id: 2,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 4, score: 2 },
				opponent2: { id: 5, score: 1 },
				winnerSide: "opponent1",
			},
			{
				id: 3,
				number: 3,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 3, score: 0 },
				opponent2: { id: 6, score: 2 },
				winnerSide: "opponent2",
			},
			{
				id: 4,
				number: 4,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 2, score: 2 },
				opponent2: { id: 7, score: 0 },
				winnerSide: "opponent1",
			},
			{
				id: 5,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 1, score: 2 },
				opponent2: { id: 4, score: 1 },
				winnerSide: "opponent1",
			},
			{
				id: 6,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 6, score: 1 },
				opponent2: { id: 2, score: 2 },
				winnerSide: "opponent2",
			},
			{
				id: 7,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 3,
				opponent1: { id: 1 },
				opponent2: { id: 2 },
				winnerSide: null,
			},
		],
	};
}

function createByeHeavySingleEliminationData(): BracketData {
	return {
		stage: [
			{
				id: 1,
				name: "Main Bracket",
				number: 1,
				type: "single_elimination",
				settings: {},
			},
		],
		group: [{ id: 1, number: 1, stageId: 1 }],
		round: [
			{
				id: 1,
				groupId: 1,
				number: 1,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				groupId: 1,
				number: 2,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				groupId: 1,
				number: 3,
				stageId: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			// Round 1 - 5 teams in a bracket of 8, only one match is played
			{
				id: 1,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 1 },
				opponent2: null,
				winnerSide: null,
			},
			{
				id: 2,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 4, score: 1 },
				opponent2: { id: 5, score: 1 },
				winnerSide: null,
			},
			{
				id: 3,
				number: 3,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 2 },
				opponent2: null,
				winnerSide: null,
			},
			{
				id: 4,
				number: 4,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 3 },
				opponent2: null,
				winnerSide: null,
			},
			// Round 2 - Semis
			{
				id: 5,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 1 },
				opponent2: { id: null },
				winnerSide: null,
			},
			{
				id: 6,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 2 },
				opponent2: { id: 3 },
				winnerSide: null,
			},
			// Round 3 - Finals
			{
				id: 7,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 3,
				opponent1: { id: null },
				opponent2: { id: null },
				winnerSide: null,
			},
		],
	};
}

function createDoubleEliminationData(): BracketData {
	return {
		stage: [
			{
				id: 1,
				name: "Main Bracket",
				number: 1,
				type: "double_elimination",
				settings: {},
			},
		],
		group: [
			{ id: 1, number: 1, stageId: 1 },
			{ id: 2, number: 2, stageId: 1 },
		],
		round: [
			{
				id: 1,
				groupId: 1,
				number: 1,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				groupId: 1,
				number: 2,
				stageId: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				groupId: 2,
				number: 1,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 4,
				groupId: 2,
				number: 2,
				stageId: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			{
				id: 1,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 1, score: 2 },
				opponent2: { id: 4, score: 0 },
				winnerSide: "opponent1",
			},
			{
				id: 2,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 2, score: 2 },
				opponent2: { id: 3, score: 1 },
				winnerSide: "opponent1",
			},
			{
				id: 3,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 1 },
				opponent2: { id: 2 },
				winnerSide: null,
			},
			{
				id: 4,
				number: 1,
				stageId: 1,
				groupId: 2,
				roundId: 3,
				opponent1: { id: 4, score: 1 },
				opponent2: { id: 3, score: 2 },
				winnerSide: "opponent2",
			},
			{
				id: 5,
				number: 1,
				stageId: 1,
				groupId: 2,
				roundId: 4,
				opponent1: { id: 3 },
				opponent2: { id: null },
				winnerSide: null,
			},
		],
	};
}

function createRoundRobinData(): BracketData {
	return {
		stage: [
			{
				id: 1,
				name: "Group Stage",
				number: 1,
				type: "round_robin",
				settings: { groupCount: 2 },
			},
		],
		group: [
			{ id: 1, number: 1, stageId: 1 },
			{ id: 2, number: 2, stageId: 1 },
		],
		round: [
			{
				id: 1,
				groupId: 1,
				number: 1,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				groupId: 1,
				number: 2,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				groupId: 1,
				number: 3,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 4,
				groupId: 2,
				number: 1,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 5,
				groupId: 2,
				number: 2,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 6,
				groupId: 2,
				number: 3,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			{
				id: 1,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 1, score: 2 },
				opponent2: { id: 2, score: 0 },
				winnerSide: "opponent1",
			},
			{
				id: 2,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 1, score: 2 },
				opponent2: { id: 3, score: 1 },
				winnerSide: "opponent1",
			},
			{
				id: 3,
				number: 3,
				stageId: 1,
				groupId: 1,
				roundId: 3,
				opponent1: { id: 2 },
				opponent2: { id: 3 },
				winnerSide: null,
			},
			{
				id: 4,
				number: 1,
				stageId: 1,
				groupId: 2,
				roundId: 4,
				opponent1: { id: 4, score: 2 },
				opponent2: { id: 5, score: 1 },
				winnerSide: "opponent1",
			},
			{
				id: 5,
				number: 2,
				stageId: 1,
				groupId: 2,
				roundId: 5,
				opponent1: { id: 4 },
				opponent2: { id: 6 },
				winnerSide: null,
			},
			{
				id: 6,
				number: 3,
				stageId: 1,
				groupId: 2,
				roundId: 6,
				opponent1: { id: 5 },
				opponent2: { id: 6 },
				winnerSide: null,
			},
		],
	};
}

function createSwissData(): BracketData {
	return {
		stage: [
			{
				id: 1,
				name: "Swiss Stage",
				number: 1,
				type: "swiss",
				settings: { groupCount: 1 },
			},
		],
		group: [{ id: 1, number: 1, stageId: 1 }],
		round: [
			{
				id: 1,
				groupId: 1,
				number: 1,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				groupId: 1,
				number: 2,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				groupId: 1,
				number: 3,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			{
				id: 1,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 1, score: 2 },
				opponent2: { id: 8, score: 0 },
				winnerSide: "opponent1",
			},
			{
				id: 2,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 2, score: 2 },
				opponent2: { id: 7, score: 1 },
				winnerSide: "opponent1",
			},
			{
				id: 3,
				number: 3,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 3, score: 1 },
				opponent2: { id: 6, score: 2 },
				winnerSide: "opponent2",
			},
			{
				id: 4,
				number: 4,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 4, score: 0 },
				opponent2: { id: 5, score: 2 },
				winnerSide: "opponent2",
			},
			{
				id: 5,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 1 },
				opponent2: { id: 2 },
				winnerSide: null,
			},
			{
				id: 6,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 5 },
				opponent2: { id: 6 },
				winnerSide: null,
			},
		],
	};
}

function createLargeSingleEliminationData(options?: {
	ongoingRoundIdx?: number;
}): BracketData {
	const { ongoingRoundIdx } = options ?? {};

	return {
		stage: [
			{
				id: 1,
				name: "Main Bracket",
				number: 1,
				type: "single_elimination",
				settings: {},
			},
		],
		group: [{ id: 1, number: 1, stageId: 1 }],
		round: [
			{
				id: 1,
				groupId: 1,
				number: 1,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				groupId: 1,
				number: 2,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				groupId: 1,
				number: 3,
				stageId: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 4,
				groupId: 1,
				number: 4,
				stageId: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			// Round 1 - 8 matches (all completed unless ongoingRoundIdx === 0)
			{
				id: 1,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 1, score: ongoingRoundIdx === 0 ? 1 : 2 },
				opponent2: { id: 8, score: ongoingRoundIdx === 0 ? 1 : 0 },
				winnerSide: ongoingRoundIdx === 0 ? null : "opponent1",
			},
			{
				id: 2,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 2, score: 2 },
				opponent2: { id: 7, score: 0 },
				winnerSide: "opponent1",
			},
			{
				id: 3,
				number: 3,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 3, score: 2 },
				opponent2: { id: 6, score: 1 },
				winnerSide: "opponent1",
			},
			{
				id: 4,
				number: 4,
				stageId: 1,
				groupId: 1,
				roundId: 1,
				opponent1: { id: 4, score: 2 },
				opponent2: { id: 5, score: 0 },
				winnerSide: "opponent1",
			},
			// Round 2 - 4 matches (all completed unless ongoingRoundIdx === 1)
			{
				id: 5,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 1, score: ongoingRoundIdx === 1 ? 1 : 2 },
				opponent2: { id: 2, score: 1 },
				winnerSide: ongoingRoundIdx === 1 ? null : "opponent1",
			},
			{
				id: 6,
				number: 2,
				stageId: 1,
				groupId: 1,
				roundId: 2,
				opponent1: { id: 3, score: 1 },
				opponent2: { id: 4, score: 2 },
				winnerSide: "opponent2",
			},
			// Round 3 - Semifinals (completed unless ongoingRoundIdx === 2)
			{
				id: 7,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 3,
				opponent1: { id: 1, score: ongoingRoundIdx === 2 ? 1 : 2 },
				opponent2: { id: 4, score: ongoingRoundIdx === 2 ? 1 : 0 },
				winnerSide: ongoingRoundIdx === 2 ? null : "opponent1",
			},
			// Round 4 - Finals (ongoing by default)
			{
				id: 8,
				number: 1,
				stageId: 1,
				groupId: 1,
				roundId: 4,
				opponent1: { id: 1 },
				opponent2: { id: 4 },
				winnerSide: null,
			},
		],
	};
}

function createMockBracket(
	type: "single_elimination" | "double_elimination" | "round_robin" | "swiss",
	data: BracketData,
): BracketType {
	return {
		id: 1,
		idx: 0,
		preview: false,
		data,
		type,
		name: "Main Bracket",
		canBeStarted: false,
		tournament: mockTournament as any,
		settings: type === "swiss" ? { roundCount: 3 } : null,
		sources: undefined,
		seeding: undefined,
		createdAt: null,
		requiresCheckIn: false,
		startTime: null,
		simulatedMatch: () => undefined,
		liveStandings: mockLiveStandings(data),
		participantTournamentTeamIds: [1, 2, 3, 4, 5, 6, 7, 8],
	} as unknown as BracketType;
}

/** Mirrors what the real implementation returns for a bracket where no match has finished yet: every participant, in seed order, with blank stats. */
function mockLiveStandings(data: BracketData) {
	return data.group.flatMap((group) => {
		const teamIds = new Set<number>();
		for (const match of data.match) {
			if (match.groupId !== group.id) continue;

			if (match.opponent1?.id) teamIds.add(match.opponent1.id);
			if (match.opponent2?.id) teamIds.add(match.opponent2.id);
		}

		return Array.from(teamIds)
			.map((id) => mockTournament.ctx.teams.find((team) => team.id === id)!)
			.filter(Boolean)
			.sort((a, b) => a.seed - b.seed)
			.map((team, i) => ({
				team,
				placement: i + 1,
				groupId: group.id,
				stats: {
					setWins: 0,
					setLosses: 0,
					mapWins: 0,
					mapLosses: 0,
					koCount: 0,
					winsAgainstTied: 0,
					lossesAgainstTied: 0,
				},
			}));
	});
}

function renderWithRouter(element: React.ReactNode) {
	const router = createMemoryRouter([{ path: "/", element }], {
		initialEntries: ["/"],
	});

	return render(<RouterProvider router={router} />);
}

describe("Single Elimination Bracket", () => {
	test("renders single elimination bracket with rounds", async () => {
		const data = createSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="single" isExpanded />,
		);

		// 8-team bracket has Round 1, Semis, Finals
		await expect.element(screen.getByText("Round 1")).toBeVisible();
		await expect.element(screen.getByText("Semis")).toBeVisible();
		await expect.element(screen.getByText("Finals")).toBeVisible();
	});

	test("renders team names in matches", async () => {
		const data = createSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="single" isExpanded />,
		);

		await expect.element(screen.getByText("Team Alpha").first()).toBeVisible();
		await expect.element(screen.getByText("Team Beta").first()).toBeVisible();
		await expect.element(screen.getByText("Team Gamma").first()).toBeVisible();
		await expect.element(screen.getByText("Team Delta").first()).toBeVisible();
	});

	test("renders match scores", async () => {
		const data = createSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="single" isExpanded />,
		);

		const scores = screen.container.querySelectorAll(
			'[data-testid="match-score"]',
		);
		expect(scores.length).toBeGreaterThan(0);
	});

	test("renders match identifiers with round and number", async () => {
		const data = createSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="single" isExpanded />,
		);

		await expect.element(screen.getByText("1.1")).toBeVisible();
		await expect.element(screen.getByText("1.2")).toBeVisible();
	});

	test("hides early completed rounds when isExpanded is false", async () => {
		const data = createLargeSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide
				bracket={bracket}
				type="single"
				isExpanded={false}
			/>,
		);

		// Round 1 and Round 2 should be hidden (completed, not in last 2)
		const round1Elements = screen.container.querySelectorAll(
			'[data-round-id="1"]',
		);
		const round2Elements = screen.container.querySelectorAll(
			'[data-round-id="2"]',
		);
		expect(round1Elements.length).toBe(0);
		expect(round2Elements.length).toBe(0);

		// Semis and Finals should be visible (last 2 rounds)
		await expect.element(screen.getByText("Semis")).toBeVisible();
		await expect.element(screen.getByText("Finals")).toBeVisible();
	});

	test("always shows at least last 2 rounds when isExpanded is false", async () => {
		const data = createLargeSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide
				bracket={bracket}
				type="single"
				isExpanded={false}
			/>,
		);

		// Should show exactly 2 round columns (Semifinals and Finals)
		const roundColumns = screen.container.querySelectorAll(
			'[data-testid="round-column"]',
		);
		expect(roundColumns.length).toBe(2);
	});

	test("shows all rounds when isExpanded is true", async () => {
		const data = createLargeSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="single" isExpanded />,
		);

		// All 4 rounds should be visible
		await expect.element(screen.getByText("Round 1")).toBeVisible();
		await expect.element(screen.getByText("Round 2")).toBeVisible();
		await expect.element(screen.getByText("Semis")).toBeVisible();
		await expect.element(screen.getByText("Finals")).toBeVisible();
	});

	test("compacts first round when fewer than half of its matches are played", async () => {
		const data = createByeHeavySingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="single" isExpanded />,
		);

		// one slot per round 2 match instead of one per potential round 1 match
		const firstRoundMatchWrappers = screen.container.querySelectorAll(
			'[data-round-id="1"] :is([data-testid="match-wrapper"], [data-testid="match-bye"])',
		);
		expect(firstRoundMatchWrappers.length).toBe(2);

		// played match connects to its destination with a straight line
		const straightLines = screen.container.querySelectorAll(
			'[data-round-id="1"] [data-line-type="straight"]',
		);
		expect(straightLines.length).toBeGreaterThan(0);

		await expect.element(screen.getByText("Team Delta")).toBeVisible();
		await expect.element(screen.getByText("Team Epsilon")).toBeVisible();
	});

	test("does not compact first round when at least half of its matches are played", async () => {
		const data = createSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="single" isExpanded />,
		);

		const firstRoundMatchWrappers = screen.container.querySelectorAll(
			'[data-round-id="1"] :is([data-testid="match-wrapper"], [data-testid="match-bye"])',
		);
		expect(firstRoundMatchWrappers.length).toBe(4);
	});

	test("shows early round with ongoing match even when isExpanded is false", async () => {
		const data = createLargeSingleEliminationData({ ongoingRoundIdx: 0 });
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide
				bracket={bracket}
				type="single"
				isExpanded={false}
			/>,
		);

		// Round 1 should be visible because it has an ongoing match
		await expect.element(screen.getByText("Round 1")).toBeVisible();
	});
});

describe("Double Elimination Bracket", () => {
	test("renders winners bracket side", async () => {
		const data = createDoubleEliminationData();
		const bracket = createMockBracket("double_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="winners" isExpanded />,
		);

		// Small 4-team bracket has Grand Finals and Bracket Reset rounds
		await expect.element(screen.getByText("Grand Finals")).toBeVisible();
	});

	test("renders losers bracket side", async () => {
		const data = createDoubleEliminationData();
		const bracket = createMockBracket("double_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="losers" isExpanded />,
		);

		// Small 4-team losers bracket has LB Semis and LB Finals
		await expect.element(screen.getByText("LB Semis")).toBeVisible();
	});

	test("renders team names in winners bracket", async () => {
		const data = createDoubleEliminationData();
		const bracket = createMockBracket("double_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="winners" isExpanded />,
		);

		await expect.element(screen.getByText("Team Alpha")).toBeVisible();
		await expect.element(screen.getByText("Team Beta")).toBeVisible();
	});

	test("renders match headers with GF prefix for grand finals", async () => {
		const data = createDoubleEliminationData();
		const bracket = createMockBracket("double_elimination", data);

		const screen = await renderWithRouter(
			<EliminationBracketSide bracket={bracket} type="winners" isExpanded />,
		);

		// Small 4-team bracket only has Grand Finals (GF prefix), not regular WB rounds
		const headerBox = screen.container.querySelector(
			'[data-testid="match-header-box"]',
		);
		expect(headerBox?.textContent).toContain("GF");
		expect(headerBox?.textContent).toContain("1.1");
	});
});

describe("Round Robin Bracket", () => {
	test("renders group headers", async () => {
		const data = createRoundRobinData();
		const bracket = createMockBracket("round_robin", data);

		const screen = await renderWithRouter(
			<RoundRobinBracket bracket={bracket} />,
		);

		await expect.element(screen.getByText("Group A")).toBeVisible();
		await expect.element(screen.getByText("Group B")).toBeVisible();
	});

	test("renders round headers within groups", async () => {
		const data = createRoundRobinData();
		const bracket = createMockBracket("round_robin", data);

		const screen = await renderWithRouter(
			<RoundRobinBracket bracket={bracket} />,
		);

		const round1Headers = screen.getByText("Round 1");
		await expect.element(round1Headers.first()).toBeVisible();
	});

	test("renders teams in group matches", async () => {
		const data = createRoundRobinData();
		const bracket = createMockBracket("round_robin", data);

		const screen = await renderWithRouter(
			<RoundRobinBracket bracket={bracket} />,
		);

		await expect.element(screen.getByText("Team Alpha").first()).toBeVisible();
		await expect.element(screen.getByText("Team Beta").first()).toBeVisible();
		await expect.element(screen.getByText("Team Delta").first()).toBeVisible();
	});

	test("renders match identifiers with group prefix", async () => {
		const data = createRoundRobinData();
		const bracket = createMockBracket("round_robin", data);

		const screen = await renderWithRouter(
			<RoundRobinBracket bracket={bracket} />,
		);

		await expect.element(screen.getByText(/A1\.1/)).toBeVisible();
		await expect.element(screen.getByText(/B1\.1/)).toBeVisible();
	});

	test("renders placements table for each group", async () => {
		const data = createRoundRobinData();
		const bracket = createMockBracket("round_robin", data);

		const screen = await renderWithRouter(
			<RoundRobinBracket bracket={bracket} />,
		);

		const tables = screen.container.querySelectorAll(
			'[data-testid="rr-standings-table"]',
		);
		expect(tables.length).toBe(2);
	});
});

describe("Swiss Bracket", () => {
	test("renders round headers", async () => {
		const data = createSwissData();
		const bracket = createMockBracket("swiss", data);

		const screen = await renderWithRouter(
			<SwissBracket bracket={bracket} bracketIdx={0} />,
		);

		await expect.element(screen.getByText("Round 1")).toBeVisible();
		await expect.element(screen.getByText("Round 2")).toBeVisible();
	});

	test("renders team names in matches", async () => {
		const data = createSwissData();
		const bracket = createMockBracket("swiss", data);

		const screen = await renderWithRouter(
			<SwissBracket bracket={bracket} bracketIdx={0} />,
		);

		await expect.element(screen.getByText("Team Alpha").first()).toBeVisible();
		await expect.element(screen.getByText("Team Beta").first()).toBeVisible();
	});

	test("renders completed match scores", async () => {
		const data = createSwissData();
		const bracket = createMockBracket("swiss", data);

		const screen = await renderWithRouter(
			<SwissBracket bracket={bracket} bracketIdx={0} />,
		);

		const scores = screen.container.querySelectorAll(
			'[data-testid="match-score"]',
		);
		expect(scores.length).toBeGreaterThan(0);
	});

	test("renders placements table", async () => {
		const data = createSwissData();
		const bracket = createMockBracket("swiss", data);

		const screen = await renderWithRouter(
			<SwissBracket bracket={bracket} bracketIdx={0} />,
		);

		const table = screen.container.querySelector(
			'[data-testid="rr-standings-table"]',
		);
		expect(table).not.toBeNull();
	});

	test("renders match identifiers with group prefix", async () => {
		const data = createSwissData();
		const bracket = createMockBracket("swiss", data);

		const screen = await renderWithRouter(
			<SwissBracket bracket={bracket} bracketIdx={0} />,
		);

		await expect.element(screen.getByText(/A1\.1/)).toBeVisible();
	});
});

describe("Bracket container component", () => {
	test("renders single elimination through main Bracket component", async () => {
		const data = createSingleEliminationData();
		const bracket = createMockBracket("single_elimination", data);

		const screen = await renderWithRouter(
			<Bracket bracket={bracket} bracketIdx={0} />,
		);

		await expect.element(screen.getByTestId("brackets-viewer")).toBeVisible();
	});

	test("renders double elimination through main Bracket component", async () => {
		const data = createDoubleEliminationData();
		const bracket = createMockBracket("double_elimination", data);

		const screen = await renderWithRouter(
			<Bracket bracket={bracket} bracketIdx={0} />,
		);

		await expect.element(screen.getByTestId("brackets-viewer")).toBeVisible();
	});

	test("renders round robin through main Bracket component", async () => {
		const data = createRoundRobinData();
		const bracket = createMockBracket("round_robin", data);

		const screen = await renderWithRouter(
			<Bracket bracket={bracket} bracketIdx={0} />,
		);

		await expect.element(screen.getByTestId("brackets-viewer")).toBeVisible();
	});

	test("renders swiss through main Bracket component", async () => {
		const data = createSwissData();
		const bracket = createMockBracket("swiss", data);

		const screen = await renderWithRouter(
			<Bracket bracket={bracket} bracketIdx={0} />,
		);

		await expect.element(screen.getByTestId("brackets-viewer")).toBeVisible();
	});
});
