import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { Bracket as BracketType } from "../../core/Bracket";
import { EliminationBracketSide } from "./Elimination";
import { Bracket } from "./index";
import { RoundRobinBracket } from "./RoundRobin";
import { SwissBracket } from "./Swiss";
import "~/features/tournament-bracket/components/Bracket/bracket.css";
import "~/features/tournament-bracket/tournament-bracket.css";

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
		participatedUsers: [1, 2, 3, 4, 5, 6, 7, 8],
	},
	brackets: [],
	teamById: (id: number) =>
		mockTournament.ctx.teams.find((t) => t.id === id) ?? null,
	teamMemberOfByUser: () => null,
	isOrganizer: () => false,
	tournamentTeamLogoSrc: () => null,
};

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

vi.mock("~/features/tournament/routes/to.$id", () => ({
	useTournament: () => mockTournament,
	useBracketExpanded: () => ({
		bracketExpanded: true,
		setBracketExpanded: vi.fn(),
	}),
	useStreamingParticipants: () => [],
}));

function createSingleEliminationData(): TournamentManagerDataSet {
	return {
		stage: [
			{
				id: 1,
				name: "Main Bracket",
				number: 1,
				type: "single_elimination",
				tournament_id: 1,
				settings: { size: 8 },
			},
		],
		group: [{ id: 1, number: 1, stage_id: 1 }],
		round: [
			{
				id: 1,
				group_id: 1,
				number: 1,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				group_id: 1,
				number: 2,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				group_id: 1,
				number: 3,
				stage_id: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			{
				id: 1,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 1, score: 2, result: "win" },
				opponent2: { id: 8, score: 0, result: "loss" },
			},
			{
				id: 2,
				number: 2,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 4, score: 2, result: "win" },
				opponent2: { id: 5, score: 1, result: "loss" },
			},
			{
				id: 3,
				number: 3,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 3, score: 0, result: "loss" },
				opponent2: { id: 6, score: 2, result: "win" },
			},
			{
				id: 4,
				number: 4,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 2, score: 2, result: "win" },
				opponent2: { id: 7, score: 0, result: "loss" },
			},
			{
				id: 5,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 2,
				status: 2,
				opponent1: { id: 1, score: 2, result: "win" },
				opponent2: { id: 4, score: 1, result: "loss" },
			},
			{
				id: 6,
				number: 2,
				stage_id: 1,
				group_id: 1,
				round_id: 2,
				status: 2,
				opponent1: { id: 6, score: 1, result: "loss" },
				opponent2: { id: 2, score: 2, result: "win" },
			},
			{
				id: 7,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 3,
				status: 4,
				opponent1: { id: 1 },
				opponent2: { id: 2 },
			},
		],
	};
}

function createDoubleEliminationData(): TournamentManagerDataSet {
	return {
		stage: [
			{
				id: 1,
				name: "Main Bracket",
				number: 1,
				type: "double_elimination",
				tournament_id: 1,
				settings: { size: 4, grandFinal: "double" },
			},
		],
		group: [
			{ id: 1, number: 1, stage_id: 1 },
			{ id: 2, number: 2, stage_id: 1 },
		],
		round: [
			{
				id: 1,
				group_id: 1,
				number: 1,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				group_id: 1,
				number: 2,
				stage_id: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				group_id: 2,
				number: 1,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 4,
				group_id: 2,
				number: 2,
				stage_id: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			{
				id: 1,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 1, score: 2, result: "win" },
				opponent2: { id: 4, score: 0, result: "loss" },
			},
			{
				id: 2,
				number: 2,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 2, score: 2, result: "win" },
				opponent2: { id: 3, score: 1, result: "loss" },
			},
			{
				id: 3,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 2,
				status: 4,
				opponent1: { id: 1 },
				opponent2: { id: 2 },
			},
			{
				id: 4,
				number: 1,
				stage_id: 1,
				group_id: 2,
				round_id: 3,
				status: 2,
				opponent1: { id: 4, score: 1, result: "loss" },
				opponent2: { id: 3, score: 2, result: "win" },
			},
			{
				id: 5,
				number: 1,
				stage_id: 1,
				group_id: 2,
				round_id: 4,
				status: 4,
				opponent1: { id: 3 },
				opponent2: { id: null },
			},
		],
	};
}

function createRoundRobinData(): TournamentManagerDataSet {
	return {
		stage: [
			{
				id: 1,
				name: "Group Stage",
				number: 1,
				type: "round_robin",
				tournament_id: 1,
				settings: { groupCount: 2, roundRobinMode: "simple", size: 6 },
			},
		],
		group: [
			{ id: 1, number: 1, stage_id: 1 },
			{ id: 2, number: 2, stage_id: 1 },
		],
		round: [
			{
				id: 1,
				group_id: 1,
				number: 1,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				group_id: 1,
				number: 2,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				group_id: 1,
				number: 3,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 4,
				group_id: 2,
				number: 1,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 5,
				group_id: 2,
				number: 2,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 6,
				group_id: 2,
				number: 3,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			{
				id: 1,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 1, score: 2, result: "win" },
				opponent2: { id: 2, score: 0, result: "loss" },
			},
			{
				id: 2,
				number: 2,
				stage_id: 1,
				group_id: 1,
				round_id: 2,
				status: 2,
				opponent1: { id: 1, score: 2, result: "win" },
				opponent2: { id: 3, score: 1, result: "loss" },
			},
			{
				id: 3,
				number: 3,
				stage_id: 1,
				group_id: 1,
				round_id: 3,
				status: 4,
				opponent1: { id: 2 },
				opponent2: { id: 3 },
			},
			{
				id: 4,
				number: 1,
				stage_id: 1,
				group_id: 2,
				round_id: 4,
				status: 2,
				opponent1: { id: 4, score: 2, result: "win" },
				opponent2: { id: 5, score: 1, result: "loss" },
			},
			{
				id: 5,
				number: 2,
				stage_id: 1,
				group_id: 2,
				round_id: 5,
				status: 4,
				opponent1: { id: 4 },
				opponent2: { id: 6 },
			},
			{
				id: 6,
				number: 3,
				stage_id: 1,
				group_id: 2,
				round_id: 6,
				status: 4,
				opponent1: { id: 5 },
				opponent2: { id: 6 },
			},
		],
	};
}

function createSwissData(): TournamentManagerDataSet {
	return {
		stage: [
			{
				id: 1,
				name: "Swiss Stage",
				number: 1,
				type: "swiss",
				tournament_id: 1,
				settings: { groupCount: 1 },
			},
		],
		group: [{ id: 1, number: 1, stage_id: 1 }],
		round: [
			{
				id: 1,
				group_id: 1,
				number: 1,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				group_id: 1,
				number: 2,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				group_id: 1,
				number: 3,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			{
				id: 1,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 1, score: 2, result: "win" },
				opponent2: { id: 8, score: 0, result: "loss" },
			},
			{
				id: 2,
				number: 2,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 2, score: 2, result: "win" },
				opponent2: { id: 7, score: 1, result: "loss" },
			},
			{
				id: 3,
				number: 3,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 3, score: 1, result: "loss" },
				opponent2: { id: 6, score: 2, result: "win" },
			},
			{
				id: 4,
				number: 4,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 4, score: 0, result: "loss" },
				opponent2: { id: 5, score: 2, result: "win" },
			},
			{
				id: 5,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 2,
				status: 4,
				opponent1: { id: 1 },
				opponent2: { id: 2 },
			},
			{
				id: 6,
				number: 2,
				stage_id: 1,
				group_id: 1,
				round_id: 2,
				status: 4,
				opponent1: { id: 5 },
				opponent2: { id: 6 },
			},
		],
	};
}

function createLargeSingleEliminationData(options?: {
	ongoingRoundIdx?: number;
}): TournamentManagerDataSet {
	const { ongoingRoundIdx } = options ?? {};

	return {
		stage: [
			{
				id: 1,
				name: "Main Bracket",
				number: 1,
				type: "single_elimination",
				tournament_id: 1,
				settings: { size: 16 },
			},
		],
		group: [{ id: 1, number: 1, stage_id: 1 }],
		round: [
			{
				id: 1,
				group_id: 1,
				number: 1,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 2,
				group_id: 1,
				number: 2,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 3,
				group_id: 1,
				number: 3,
				stage_id: 1,
				maps: { count: 3, type: "BEST_OF", pickBan: null },
			},
			{
				id: 4,
				group_id: 1,
				number: 4,
				stage_id: 1,
				maps: { count: 5, type: "BEST_OF", pickBan: null },
			},
		],
		match: [
			// Round 1 - 8 matches (all completed unless ongoingRoundIdx === 0)
			{
				id: 1,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: ongoingRoundIdx === 0 ? 3 : 2,
				opponent1:
					ongoingRoundIdx === 0
						? { id: 1, score: 1 }
						: { id: 1, score: 2, result: "win" },
				opponent2:
					ongoingRoundIdx === 0
						? { id: 8, score: 1 }
						: { id: 8, score: 0, result: "loss" },
			},
			{
				id: 2,
				number: 2,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 2, score: 2, result: "win" },
				opponent2: { id: 7, score: 0, result: "loss" },
			},
			{
				id: 3,
				number: 3,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 3, score: 2, result: "win" },
				opponent2: { id: 6, score: 1, result: "loss" },
			},
			{
				id: 4,
				number: 4,
				stage_id: 1,
				group_id: 1,
				round_id: 1,
				status: 2,
				opponent1: { id: 4, score: 2, result: "win" },
				opponent2: { id: 5, score: 0, result: "loss" },
			},
			// Round 2 - 4 matches (all completed unless ongoingRoundIdx === 1)
			{
				id: 5,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 2,
				status: ongoingRoundIdx === 1 ? 3 : 2,
				opponent1:
					ongoingRoundIdx === 1
						? { id: 1, score: 1 }
						: { id: 1, score: 2, result: "win" },
				opponent2:
					ongoingRoundIdx === 1
						? { id: 2, score: 1 }
						: { id: 2, score: 1, result: "loss" },
			},
			{
				id: 6,
				number: 2,
				stage_id: 1,
				group_id: 1,
				round_id: 2,
				status: 2,
				opponent1: { id: 3, score: 1, result: "loss" },
				opponent2: { id: 4, score: 2, result: "win" },
			},
			// Round 3 - Semifinals (completed unless ongoingRoundIdx === 2)
			{
				id: 7,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 3,
				status: ongoingRoundIdx === 2 ? 3 : 2,
				opponent1:
					ongoingRoundIdx === 2
						? { id: 1, score: 1 }
						: { id: 1, score: 2, result: "win" },
				opponent2:
					ongoingRoundIdx === 2
						? { id: 4, score: 1 }
						: { id: 4, score: 0, result: "loss" },
			},
			// Round 4 - Finals (ongoing by default)
			{
				id: 8,
				number: 1,
				stage_id: 1,
				group_id: 1,
				round_id: 4,
				status: 4,
				opponent1: { id: 1 },
				opponent2: { id: 4 },
			},
		],
	};
}

function createMockBracket(
	type: "single_elimination" | "double_elimination" | "round_robin" | "swiss",
	data: TournamentManagerDataSet,
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
		currentStandings: () => [],
		participantTournamentTeamIds: [1, 2, 3, 4, 5, 6, 7, 8],
	} as unknown as BracketType;
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

		const scores = screen.container.querySelectorAll(".bracket__match__score");
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
			".elim-bracket__round-column",
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
			".bracket__match__header__box",
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

		const tables = screen.container.querySelectorAll(".rr__placements-table");
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

		const scores = screen.container.querySelectorAll(".bracket__match__score");
		expect(scores.length).toBeGreaterThan(0);
	});

	test("renders placements table", async () => {
		const data = createSwissData();
		const bracket = createMockBracket("swiss", data);

		const screen = await renderWithRouter(
			<SwissBracket bracket={bracket} bracketIdx={0} />,
		);

		const table = screen.container.querySelector(".rr__placements-table");
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
