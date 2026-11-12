import { ordinal, rating } from "openskill";
import { describe, expect, test } from "vitest";
import type { AllMatchResult } from "~/features/tournament-match/TournamentMatchRepository.server";
import { invariant } from "~/utils/invariant";
import type { Tables } from "../../../db/tables";
import type * as Progression from "./Progression";
import { summaryRatingTargets, tournamentSummary } from "./summarizer.server";
import type { TournamentDataTeam } from "./Tournament.server";
import { tournamentCtxTeam } from "./tests/test-utils";

const createOpponent = (
	id: number,
	score: number,
	droppedOut = false,
	activeRosterUserIds: number[] | null = null,
	memberUserIds: number[] = [],
): AllMatchResult["opponentOne"] => ({
	id,
	score,
	droppedOut,
	activeRosterUserIds,
	memberUserIds,
});

const TEAM_ONE = [1, 2, 3, 4];
const TEAM_TWO = [5, 6, 7, 8];
const STARTING_MU = rating().mu;

const playedMap = ({
	winnerTeamId,
	lineups,
	mode = "SZ",
	stageId = 1,
}: {
	winnerTeamId: number;
	lineups: Array<[teamId: number, userIds: number[]]>;
	mode?: AllMatchResult["maps"][number]["mode"];
	stageId?: AllMatchResult["maps"][number]["stageId"];
}): AllMatchResult["maps"][number] => ({
	mode,
	stageId,
	winnerTeamId,
	participants: lineups.flatMap(([tournamentTeamId, userIds]) =>
		userIds.map((userId) => ({ tournamentTeamId, userId })),
	),
});

const playedSet = ({
	maps,
	winnerSide = "opponent1",
	opponentOneId = 1,
	opponentTwoId = 2,
}: {
	maps: AllMatchResult["maps"];
	winnerSide?: "opponent1" | "opponent2";
	opponentOneId?: number;
	opponentTwoId?: number;
}): AllMatchResult => {
	const winnerId = winnerSide === "opponent1" ? opponentOneId : opponentTwoId;
	const winnerScore = maps.filter((m) => m.winnerTeamId === winnerId).length;
	const loserScore = maps.length - winnerScore;

	return {
		maps,
		opponentOne: createOpponent(
			opponentOneId,
			winnerSide === "opponent1" ? winnerScore : loserScore,
		),
		opponentTwo: createOpponent(
			opponentTwoId,
			winnerSide === "opponent2" ? winnerScore : loserScore,
		),
		winnerSide,
		roundMaps: { count: 3, type: "BEST_OF" },
	};
};

const sweep = ({
	winnerSide,
	opponentOneId = 1,
	opponentTwoId = 2,
	opponentOneLineup = TEAM_ONE,
	opponentTwoLineup = TEAM_TWO,
}: {
	winnerSide: "opponent1" | "opponent2";
	opponentOneId?: number;
	opponentTwoId?: number;
	opponentOneLineup?: number[];
	opponentTwoLineup?: number[];
}) => {
	const winnerTeamId =
		winnerSide === "opponent1" ? opponentOneId : opponentTwoId;
	const lineups: Array<[number, number[]]> = [
		[opponentOneId, opponentOneLineup],
		[opponentTwoId, opponentTwoLineup],
	];

	return playedSet({
		winnerSide,
		opponentOneId,
		opponentTwoId,
		maps: [
			playedMap({ winnerTeamId, lineups, mode: "SZ", stageId: 1 }),
			playedMap({ winnerTeamId, lineups, mode: "TC", stageId: 2 }),
		],
	});
};

describe("tournamentSummary()", () => {
	const createTeam = (teamId: number, userIds: number[]) =>
		tournamentCtxTeam(teamId, {
			checkIns: [],
			memberUserIds: userIds,
			ownerUserId: userIds[0] ?? null,
			seed: 1,
		});

	function summarize({
		results,
		seedingSkillCountsFor,
		withMemberInTwoTeams = false,
		teamsWithStartingBrackets,
		teamsWithAbDivisions,
		progression,
		finalStandings,
	}: {
		results?: AllMatchResult[];
		seedingSkillCountsFor?: Tables["SeedingSkill"]["type"];
		withMemberInTwoTeams?: boolean;
		teamsWithStartingBrackets?: Array<{
			id: number;
			startingBracketIdx: number | null;
		}>;
		teamsWithAbDivisions?: Array<{
			id: number;
			abDivision: 0 | 1;
		}>;
		progression?: Progression.ParsedBracket[];
		finalStandings?: Array<{
			placement: number;
			team: TournamentDataTeam;
		}>;
	} = {}) {
		const defaultTeams = [
			{ id: 1, memberUserIds: [1, 2, 3, 4, 20] },
			{ id: 2, memberUserIds: [5, 6, 7, 8] },
			{ id: 3, memberUserIds: [9, 10, 11, 12] },
			{ id: 4, memberUserIds: [13, 14, 15, 16] },
		];

		const teams = defaultTeams.map((team) => {
			const startingBracket = teamsWithStartingBrackets?.find(
				(t) => t.id === team.id,
			);
			const abDivisionEntry = teamsWithAbDivisions?.find(
				(t) => t.id === team.id,
			);
			return {
				...team,
				startingBracketIdx: startingBracket?.startingBracketIdx ?? null,
				abDivision: abDivisionEntry?.abDivision ?? null,
			};
		});

		return tournamentSummary({
			finalStandings: finalStandings ?? [
				{
					placement: 1,
					team: createTeam(
						1,
						withMemberInTwoTeams ? [1, 2, 3, 4, 5] : [1, 2, 3, 4],
					),
				},
				{
					placement: 2,
					team: createTeam(2, [5, 6, 7, 8]),
				},
				{
					placement: 3,
					team: createTeam(3, [9, 10, 11, 12]),
				},
				{
					placement: 4,
					team: createTeam(4, [13, 14, 15, 16]),
				},
			],
			results: results ?? [
				{
					maps: [
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 1 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
						{
							mode: "TC",
							stageId: 2,
							participants: [
								{ tournamentTeamId: 1, userId: 1 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
					],
					opponentOne: createOpponent(1, 2),
					opponentTwo: createOpponent(2, 0),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
			teams,
			queryCurrentTeamRating: () => rating(),
			queryCurrentUserRating: () => rating(),
			queryTeamPlayerRatingAverage: () => rating(),
			queryCurrentSeedingRating: () => rating(),
			seedingSkillCountsFor: seedingSkillCountsFor ?? null,
			progression: progression ?? [
				{
					name: "Main Bracket",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
			],
		});
	}

	test("calculates final standings", () => {
		const summary = summarize();
		expect(summary.tournamentResults.length).toBe(4 * 4);
	});

	test("calculates final standings, handling a player in two teams", () => {
		const summary = summarize({ withMemberInTwoTeams: true });
		expect(
			summary.tournamentResults.some(
				(result) => result.tournamentTeamId === 1 && result.userId === 5,
			),
		).toBeTruthy();
		expect(summary.tournamentResults.length).toBe(4 * 4);
	});

	test("winners skill should go up, losers skill should go down", () => {
		const summary = summarize();
		const winnerSkill = summary.skills.find((s) => s.userId === 1);
		const loserSkill = summary.skills.find((s) => s.userId === 5);

		invariant(winnerSkill, "winnerSkill should be defined");
		invariant(loserSkill, "loserSkill should be defined");
		expect(ordinal(winnerSkill)).toBeGreaterThan(ordinal(loserSkill));
	});

	test("seeding skill is calculated the same as normal skill", () => {
		const summary = summarize({ seedingSkillCountsFor: "RANKED" });
		const winnerSkill = summary.skills.find((s) => s.userId === 1);
		const winnerSeedingSkill = summary.skills.find((s) => s.userId === 1);

		invariant(winnerSkill, "winnerSkill should be defined");
		invariant(winnerSeedingSkill, "winnerSeedingSkill should be defined");

		expect(ordinal(winnerSkill)).toBe(ordinal(winnerSeedingSkill));
	});

	test("no seeding skill calculated if seedingSkillCountsFor is null", () => {
		const summary = summarize();

		expect(summary.seedingSkills.length).toBe(0);
	});

	test("seeding skills type matches the given seedingSkillCountsFor", () => {
		const summary = summarize({ seedingSkillCountsFor: "RANKED" });
		expect(summary.seedingSkills[0].type).toBe("RANKED");

		const summary2 = summarize({ seedingSkillCountsFor: "UNRANKED" });
		expect(summary2.seedingSkills[0].type).toBe("UNRANKED");
	});

	const resultsWith20: AllMatchResult[] = [
		{
			maps: [
				{
					mode: "SZ",
					stageId: 1,
					participants: [
						{ tournamentTeamId: 1, userId: 1 },
						{ tournamentTeamId: 1, userId: 2 },
						{ tournamentTeamId: 1, userId: 3 },
						{ tournamentTeamId: 1, userId: 4 },
						{ tournamentTeamId: 2, userId: 5 },
						{ tournamentTeamId: 2, userId: 6 },
						{ tournamentTeamId: 2, userId: 7 },
						{ tournamentTeamId: 2, userId: 8 },
					],
					winnerTeamId: 1,
				},
				{
					mode: "TC",
					stageId: 2,
					participants: [
						{ tournamentTeamId: 1, userId: 1 },
						{ tournamentTeamId: 1, userId: 2 },
						{ tournamentTeamId: 1, userId: 3 },
						{ tournamentTeamId: 1, userId: 4 },
						{ tournamentTeamId: 2, userId: 5 },
						{ tournamentTeamId: 2, userId: 6 },
						{ tournamentTeamId: 2, userId: 7 },
						{ tournamentTeamId: 2, userId: 8 },
					],
					winnerTeamId: 1,
				},
			],
			opponentOne: createOpponent(1, 2),
			opponentTwo: createOpponent(2, 0),
			winnerSide: "opponent1",
			roundMaps: {
				count: 3,
				type: "BEST_OF",
			},
		},
		{
			maps: [
				{
					mode: "SZ",
					stageId: 1,
					participants: [
						{ tournamentTeamId: 1, userId: 1 },
						{ tournamentTeamId: 1, userId: 20 },
						{ tournamentTeamId: 1, userId: 3 },
						{ tournamentTeamId: 1, userId: 4 },
						{ tournamentTeamId: 2, userId: 5 },
						{ tournamentTeamId: 2, userId: 6 },
						{ tournamentTeamId: 2, userId: 7 },
						{ tournamentTeamId: 2, userId: 8 },
					],
					winnerTeamId: 1,
				},
				{
					mode: "TC",
					stageId: 2,
					participants: [
						{ tournamentTeamId: 1, userId: 1 },
						{ tournamentTeamId: 1, userId: 20 },
						{ tournamentTeamId: 1, userId: 3 },
						{ tournamentTeamId: 1, userId: 4 },
						{ tournamentTeamId: 2, userId: 5 },
						{ tournamentTeamId: 2, userId: 6 },
						{ tournamentTeamId: 2, userId: 7 },
						{ tournamentTeamId: 2, userId: 8 },
					],
					winnerTeamId: 1,
				},
			],
			opponentOne: createOpponent(1, 2),
			opponentTwo: createOpponent(2, 0),
			winnerSide: "opponent1",
			roundMaps: {
				count: 3,
				type: "BEST_OF",
			},
		},
	];

	test("winning more than once makes the skill go up more", () => {
		const summary = summarize({
			results: resultsWith20,
		});
		const twoTimeWinnerSkill = summary.skills.find((s) => s.userId === 1);
		const oneTimeWinnerSkill = summary.skills.find((s) => s.userId === 2);

		invariant(twoTimeWinnerSkill, "twoTimeWinnerSkill should be defined");
		invariant(oneTimeWinnerSkill, "oneTimeWinnerSkill should be defined");
		expect(ordinal(twoTimeWinnerSkill)).toBeGreaterThan(
			ordinal(oneTimeWinnerSkill),
		);
	});

	test("calculates team skills (many rosters for same team)", () => {
		const summary = summarize({
			results: resultsWith20,
		});
		const teamOneRosterOne = summary.skills.find(
			(s) => s.identifier === "1-2-3-4",
		);
		const teamOneRosterTwo = summary.skills.find(
			(s) => s.identifier === "1-3-4-20",
		);
		expect(teamOneRosterOne).toBeTruthy();
		expect(teamOneRosterTwo).toBeTruthy();
	});

	const resultsWithSubbedRoster: AllMatchResult[] = [
		{
			maps: [
				{
					mode: "SZ",
					stageId: 1,
					participants: [
						{ tournamentTeamId: 1, userId: 1 },
						{ tournamentTeamId: 1, userId: 2 },
						{ tournamentTeamId: 1, userId: 3 },
						{ tournamentTeamId: 1, userId: 4 },
						{ tournamentTeamId: 2, userId: 5 },
						{ tournamentTeamId: 2, userId: 6 },
						{ tournamentTeamId: 2, userId: 7 },
						{ tournamentTeamId: 2, userId: 8 },
					],
					winnerTeamId: 1,
				},
				{
					mode: "TC",
					stageId: 2,
					participants: [
						{ tournamentTeamId: 1, userId: 1 },
						{ tournamentTeamId: 1, userId: 2 },
						{ tournamentTeamId: 1, userId: 3 },
						{ tournamentTeamId: 1, userId: 4 },
						{ tournamentTeamId: 2, userId: 5 },
						{ tournamentTeamId: 2, userId: 6 },
						{ tournamentTeamId: 2, userId: 7 },
						{ tournamentTeamId: 2, userId: 8 },
					],
					winnerTeamId: 2,
				},
				{
					mode: "TC",
					stageId: 2,
					participants: [
						{ tournamentTeamId: 1, userId: 1 },
						{ tournamentTeamId: 1, userId: 20 },
						{ tournamentTeamId: 1, userId: 3 },
						{ tournamentTeamId: 1, userId: 4 },
						{ tournamentTeamId: 2, userId: 5 },
						{ tournamentTeamId: 2, userId: 6 },
						{ tournamentTeamId: 2, userId: 7 },
						{ tournamentTeamId: 2, userId: 8 },
					],
					winnerTeamId: 1,
				},
			],
			opponentOne: createOpponent(1, 2),
			opponentTwo: createOpponent(2, 1),
			winnerSide: "opponent1",
			roundMaps: {
				count: 3,
				type: "BEST_OF",
			},
		},
	];

	test("In the case of sub calculates skill based on the most common roster", () => {
		const summary = summarize({
			results: resultsWithSubbedRoster,
		});
		const teamOneRosterOne = summary.skills.find(
			(s) => s.identifier === "1-2-3-4",
		);
		const teamOneRosterTwo = summary.skills.find(
			(s) => s.identifier === "1-3-4-20",
		);
		expect(teamOneRosterOne).toBeTruthy();
		expect(teamOneRosterTwo).toBeFalsy();
	});

	test("In the case of sub calculates player results based on the most common roster", () => {
		const summary = summarize({
			results: resultsWithSubbedRoster,
		});
		expect(
			summary.playerResultDeltas.find(
				(p) =>
					p.ownerUserId === 5 &&
					p.otherUserId === 20 &&
					(p.setWins > 0 || p.setLosses > 0),
			),
		).toBeFalsy();
	});

	test("calculates results of mates", () => {
		const summary = summarize();
		const result = summary.playerResultDeltas.find(
			(r) => r.ownerUserId === 1 && r.otherUserId === 2,
		);

		invariant(result, "result should be defined");
		expect(result.setWins).toBe(1);
		expect(result.setLosses).toBe(0);
		expect(result.mapWins).toBe(2);
		expect(result.mapLosses).toBe(0);
		expect(result.type).toBe("MATE");
	});

	test("calculates results of opponents", () => {
		const summary = summarize();
		const result = summary.playerResultDeltas.find(
			(r) => r.ownerUserId === 1 && r.otherUserId === 5,
		);

		invariant(result, "result should be defined");
		expect(result.setWins).toBe(1);
		expect(result.setLosses).toBe(0);
		expect(result.mapWins).toBe(2);
		expect(result.mapLosses).toBe(0);
		expect(result.type).toBe("ENEMY");
	});

	test("calculates results of opponents (losing side)", () => {
		const summary = summarize();
		const result = summary.playerResultDeltas.find(
			(r) => r.ownerUserId === 5 && r.otherUserId === 1,
		);

		invariant(result, "result should be defined");
		expect(result.setWins).toBe(0);
		expect(result.setLosses).toBe(1);
		expect(result.mapWins).toBe(0);
		expect(result.mapLosses).toBe(2);
		expect(result.type).toBe("ENEMY");
	});

	test("calculates map results", () => {
		const summary = summarize();
		const result = summary.mapResultDeltas.filter((r) => r.userId === 1);
		expect(result.length).toBe(2);
		expect(result.every((r) => r.wins === 1 && r.losses === 0)).toBeTruthy();
	});

	test("calculates set results array", () => {
		const summary = summarize();

		const winner = summary.setResults.get(1);
		const loser = summary.setResults.get(5);
		const sub = summary.setResults.get(20);

		invariant(winner, "winner should be defined");
		invariant(loser, "loser should be defined");
		invariant(sub, "sub should be defined");

		expect(winner).toEqual(["W"]);
		expect(loser).toEqual(["L"]);
		expect(sub).toEqual([null]);
	});

	test("playing for many teams should include combined sets in the set results array", () => {
		const summary = summarize({
			withMemberInTwoTeams: true,
			results: resultsWith20,
		});

		const results = summary.setResults.get(20);

		// only sub for the first team (null) and winning for the second team (W)
		expect(results).toEqual([null, "W"]);
	});

	test("playing minority of maps in a set should not be count for set results", () => {
		const summary = summarize({
			results: [
				{
					maps: [
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 1 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 20 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 20 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
					],
					opponentOne: createOpponent(1, 3),
					opponentTwo: createOpponent(2, 0),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
		});

		const results = summary.setResults.get(1);
		expect(results).toEqual([null]);
	});

	test("playing in half the maps should be enough to count for set results", () => {
		const summary = summarize({
			results: [
				{
					maps: [
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 1 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 20 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
					],
					opponentOne: createOpponent(1, 2),
					opponentTwo: createOpponent(2, 0),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
		});

		for (const userId of [1, 20]) {
			const results = summary.setResults.get(userId);
			invariant(results, `results for user ${userId} should be defined`);
			expect(results).toEqual(["W"]);
		}
	});

	test("div is null when teams have no startingBracketIdx", () => {
		const summary = summarize();

		for (const result of summary.tournamentResults) {
			expect(result.div).toBeNull();
		}
	});

	test("div is set correctly for teams with startingBracketIdx", () => {
		const summary = summarize({
			teamsWithStartingBrackets: [
				{ id: 1, startingBracketIdx: 0 },
				{ id: 2, startingBracketIdx: 1 },
				{ id: 3, startingBracketIdx: 0 },
				{ id: 4, startingBracketIdx: 1 },
			],
			progression: [
				{
					name: "Division 1",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
				{
					name: "Division 2",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
			],
			finalStandings: [
				{
					placement: 1,
					team: createTeam(1, [1, 2, 3, 4]),
				},
				{
					placement: 1,
					team: createTeam(2, [5, 6, 7, 8]),
				},
				{
					placement: 2,
					team: createTeam(3, [9, 10, 11, 12]),
				},
				{
					placement: 2,
					team: createTeam(4, [13, 14, 15, 16]),
				},
			],
		});

		const team1Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 1,
		);
		const team2Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 2,
		);

		expect(team1Results.every((r) => r.div === "Division 1")).toBeTruthy();
		expect(team2Results.every((r) => r.div === "Division 2")).toBeTruthy();
	});

	test("participantCount is correct for multi-division tournaments", () => {
		const summary = summarize({
			teamsWithStartingBrackets: [
				{ id: 1, startingBracketIdx: 0 },
				{ id: 2, startingBracketIdx: 1 },
				{ id: 3, startingBracketIdx: 0 },
				{ id: 4, startingBracketIdx: 1 },
			],
			progression: [
				{
					name: "Division 1",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
				{
					name: "Division 2",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
			],
			finalStandings: [
				{
					placement: 1,
					team: createTeam(1, [1, 2, 3, 4]),
				},
				{
					placement: 1,
					team: createTeam(2, [5, 6, 7, 8]),
				},
				{
					placement: 2,
					team: createTeam(3, [9, 10, 11, 12]),
				},
				{
					placement: 2,
					team: createTeam(4, [13, 14, 15, 16]),
				},
			],
		});

		const team1Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 1,
		);
		const team2Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 2,
		);
		const team3Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 3,
		);
		const team4Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 4,
		);

		expect(team1Results.every((r) => r.participantCount === 2)).toBeTruthy();
		expect(team2Results.every((r) => r.participantCount === 2)).toBeTruthy();
		expect(team3Results.every((r) => r.participantCount === 2)).toBeTruthy();
		expect(team4Results.every((r) => r.participantCount === 2)).toBeTruthy();
	});

	test("teams never assigned a starting bracket get the first division's div and participant count", () => {
		// teams register with startingBracketIdx null, which everywhere else means the first starting bracket
		const summary = summarize({
			teamsWithStartingBrackets: [
				{ id: 1, startingBracketIdx: null },
				{ id: 2, startingBracketIdx: 1 },
				{ id: 3, startingBracketIdx: null },
				{ id: 4, startingBracketIdx: 1 },
			],
			progression: [
				{
					name: "Division 1",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
				{
					name: "Division 2",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
			],
			finalStandings: [
				{
					placement: 1,
					team: createTeam(1, [1, 2, 3, 4]),
				},
				{
					placement: 1,
					team: createTeam(2, [5, 6, 7, 8]),
				},
				{
					placement: 2,
					team: createTeam(3, [9, 10, 11, 12]),
				},
				{
					placement: 2,
					team: createTeam(4, [13, 14, 15, 16]),
				},
			],
		});

		const team1Results = summary.tournamentResults
			.filter((r) => r.tournamentTeamId === 1)
			.map((r) => ({ div: r.div, participantCount: r.participantCount }));

		expect(team1Results).toEqual(
			Array.from({ length: 4 }, () => ({
				div: "Division 1",
				participantCount: 2,
			})),
		);
	});

	test("div is set from abDivision when finals is an A/B divisions round robin", () => {
		const summary = summarize({
			teamsWithAbDivisions: [
				{ id: 1, abDivision: 0 },
				{ id: 2, abDivision: 1 },
				{ id: 3, abDivision: 0 },
				{ id: 4, abDivision: 1 },
			],
			progression: [
				{
					name: "Groups stage",
					type: "round_robin",
					settings: { hasAbDivisions: true, teamsPerGroup: 4 },
					requiresCheckIn: false,
				},
			],
			finalStandings: [
				{
					placement: 1,
					team: createTeam(1, [1, 2, 3, 4]),
				},
				{
					placement: 1,
					team: createTeam(2, [5, 6, 7, 8]),
				},
				{
					placement: 2,
					team: createTeam(3, [9, 10, 11, 12]),
				},
				{
					placement: 2,
					team: createTeam(4, [13, 14, 15, 16]),
				},
			],
		});

		const team1Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 1,
		);
		const team2Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 2,
		);
		const team3Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 3,
		);
		const team4Results = summary.tournamentResults.filter(
			(r) => r.tournamentTeamId === 4,
		);

		expect(team1Results.every((r) => r.div === "A")).toBeTruthy();
		expect(team2Results.every((r) => r.div === "B")).toBeTruthy();
		expect(team3Results.every((r) => r.div === "A")).toBeTruthy();
		expect(team4Results.every((r) => r.div === "B")).toBeTruthy();
	});

	test("participantCount counts teams per abDivision for A/B finals", () => {
		const summary = summarize({
			teamsWithAbDivisions: [
				{ id: 1, abDivision: 0 },
				{ id: 2, abDivision: 1 },
				{ id: 3, abDivision: 0 },
				{ id: 4, abDivision: 1 },
			],
			progression: [
				{
					name: "Groups stage",
					type: "round_robin",
					settings: { hasAbDivisions: true, teamsPerGroup: 4 },
					requiresCheckIn: false,
				},
			],
			finalStandings: [
				{
					placement: 1,
					team: createTeam(1, [1, 2, 3, 4]),
				},
				{
					placement: 1,
					team: createTeam(2, [5, 6, 7, 8]),
				},
				{
					placement: 2,
					team: createTeam(3, [9, 10, 11, 12]),
				},
				{
					placement: 2,
					team: createTeam(4, [13, 14, 15, 16]),
				},
			],
		});

		for (const result of summary.tournamentResults) {
			expect(result.participantCount).toBe(2);
		}
	});

	test("excludes matches ended early by organizer from calculations", () => {
		const summary = summarize({
			results: [
				{
					maps: [
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 1 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
					],
					opponentOne: createOpponent(1, 0),
					opponentTwo: createOpponent(2, 0),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
		});

		expect(summary.skills.length).toBe(0);
		expect(summary.mapResultDeltas.length).toBe(0);
		expect(summary.playerResultDeltas.length).toBe(0);
	});

	test("includes normal matches but excludes early-ended matches from calculations", () => {
		const summary = summarize({
			results: [
				{
					maps: [
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 1 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
					],
					opponentOne: createOpponent(1, 1),
					opponentTwo: createOpponent(2, 0),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
				{
					maps: [
						{
							mode: "TC",
							stageId: 2,
							participants: [
								{ tournamentTeamId: 3, userId: 9 },
								{ tournamentTeamId: 3, userId: 10 },
								{ tournamentTeamId: 3, userId: 11 },
								{ tournamentTeamId: 3, userId: 12 },
								{ tournamentTeamId: 4, userId: 13 },
								{ tournamentTeamId: 4, userId: 14 },
								{ tournamentTeamId: 4, userId: 15 },
								{ tournamentTeamId: 4, userId: 16 },
							],
							winnerTeamId: 3,
						},
					],
					opponentOne: createOpponent(3, 0),
					opponentTwo: createOpponent(4, 0),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
		});

		const skillsFromTeam1 = summary.skills.filter((s) =>
			[1, 2, 3, 4].includes(s.userId ?? 0),
		);
		const skillsFromTeam2 = summary.skills.filter((s) =>
			[5, 6, 7, 8].includes(s.userId ?? 0),
		);
		const skillsFromTeam3 = summary.skills.filter((s) =>
			[9, 10, 11, 12].includes(s.userId ?? 0),
		);
		const skillsFromTeam4 = summary.skills.filter((s) =>
			[13, 14, 15, 16].includes(s.userId ?? 0),
		);

		expect(skillsFromTeam1.length).toBe(0);
		expect(skillsFromTeam2.length).toBe(0);
		expect(skillsFromTeam3.length).toBe(0);
		expect(skillsFromTeam4.length).toBe(0);
	});

	test("includes early-ended matches from dropped teams in skill calculations", () => {
		const summary = summarize({
			results: [
				{
					maps: [
						{
							mode: "SZ",
							stageId: 1,
							participants: [
								{ tournamentTeamId: 1, userId: 1 },
								{ tournamentTeamId: 1, userId: 2 },
								{ tournamentTeamId: 1, userId: 3 },
								{ tournamentTeamId: 1, userId: 4 },
								{ tournamentTeamId: 2, userId: 5 },
								{ tournamentTeamId: 2, userId: 6 },
								{ tournamentTeamId: 2, userId: 7 },
								{ tournamentTeamId: 2, userId: 8 },
							],
							winnerTeamId: 1,
						},
					],
					opponentOne: createOpponent(1, 1, false),
					opponentTwo: createOpponent(2, 0, true),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
		});

		const skillsFromTeam1 = summary.skills.filter((s) =>
			[1, 2, 3, 4].includes(s.userId ?? 0),
		);
		const skillsFromTeam2 = summary.skills.filter((s) =>
			[5, 6, 7, 8].includes(s.userId ?? 0),
		);

		expect(skillsFromTeam1.length).toBe(4);
		expect(skillsFromTeam2.length).toBe(4);
	});

	test("includes dropped team sets without maps using active roster", () => {
		const summary = summarize({
			results: [
				{
					maps: [],
					opponentOne: createOpponent(1, 0, false, [1, 2, 3, 4]),
					opponentTwo: createOpponent(2, 0, true, [5, 6, 7, 8]),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
		});

		const skillsFromTeam1 = summary.skills.filter((s) =>
			[1, 2, 3, 4].includes(s.userId ?? 0),
		);
		const skillsFromTeam2 = summary.skills.filter((s) =>
			[5, 6, 7, 8].includes(s.userId ?? 0),
		);

		expect(skillsFromTeam1.length).toBe(4);
		expect(skillsFromTeam2.length).toBe(4);
	});

	test("includes dropped team sets without maps using memberUserIds as fallback", () => {
		const summary = summarize({
			results: [
				{
					maps: [],
					// No activeRosterUserIds, but memberUserIds is set
					opponentOne: createOpponent(1, 0, false, null, [1, 2, 3, 4]),
					opponentTwo: createOpponent(2, 0, true, null, [5, 6, 7, 8]),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
		});

		const skillsFromTeam1 = summary.skills.filter((s) =>
			[1, 2, 3, 4].includes(s.userId ?? 0),
		);
		const skillsFromTeam2 = summary.skills.filter((s) =>
			[5, 6, 7, 8].includes(s.userId ?? 0),
		);

		expect(skillsFromTeam1.length).toBe(4);
		expect(skillsFromTeam2.length).toBe(4);
	});

	test("summarizes a dropped team set without maps when the dropped team has subs and no active roster", () => {
		const summary = summarize({
			results: [
				{
					maps: [],
					opponentOne: createOpponent(1, 0, false, null, [1, 2, 3, 4]),
					opponentTwo: createOpponent(2, 0, true, null, [5, 6, 7, 8, 17]),
					winnerSide: "opponent1",
					roundMaps: {
						count: 3,
						type: "BEST_OF",
					},
				},
			],
		});

		expect(summary.tournamentResults.length).toBe(4 * 4);
	});

	const playerMu = (summary: ReturnType<typeof summarize>, userId: number) =>
		summary.skills.find((s) => s.userId === userId)?.mu;
	const teamMu = (summary: ReturnType<typeof summarize>, identifier: string) =>
		summary.skills.find((s) => s.identifier === identifier)?.mu;

	const winnerAndLoserOf = (winnerSide: "opponent1" | "opponent2") =>
		winnerSide === "opponent1"
			? { winners: TEAM_ONE, losers: TEAM_TWO }
			: { winners: TEAM_TWO, losers: TEAM_ONE };

	test.each(["opponent1", "opponent2"] as const)(
		"players of the set winner gain rating and the losers lose it (%s wins)",
		(winnerSide) => {
			const summary = summarize({ results: [sweep({ winnerSide })] });
			const { winners, losers } = winnerAndLoserOf(winnerSide);

			for (const userId of winners) {
				expect(playerMu(summary, userId)).toBeGreaterThan(STARTING_MU);
			}
			for (const userId of losers) {
				expect(playerMu(summary, userId)).toBeLessThan(STARTING_MU);
			}
		},
	);

	test.each(["opponent1", "opponent2"] as const)(
		"the winning lineup's team rating goes up and the losing lineup's goes down (%s wins)",
		(winnerSide) => {
			const summary = summarize({ results: [sweep({ winnerSide })] });
			const { winners, losers } = winnerAndLoserOf(winnerSide);

			expect(teamMu(summary, winners.join("-"))).toBeGreaterThan(STARTING_MU);
			expect(teamMu(summary, losers.join("-"))).toBeLessThan(STARTING_MU);
		},
	);

	test.each(["opponent1", "opponent2"] as const)(
		"in a set a team dropped out of before any map was played, the opponent's players and team gain rating and the dropped team's lose it (%s wins)",
		(winnerSide) => {
			const summary = summarize({
				results: [
					{
						maps: [],
						opponentOne: createOpponent(
							1,
							0,
							winnerSide === "opponent2",
							TEAM_ONE,
						),
						opponentTwo: createOpponent(
							2,
							0,
							winnerSide === "opponent1",
							TEAM_TWO,
						),
						winnerSide,
						roundMaps: { count: 3, type: "BEST_OF" },
					},
				],
			});
			const { winners, losers } = winnerAndLoserOf(winnerSide);

			for (const userId of winners) {
				expect(playerMu(summary, userId)).toBeGreaterThan(STARTING_MU);
			}
			for (const userId of losers) {
				expect(playerMu(summary, userId)).toBeLessThan(STARTING_MU);
			}
			expect(teamMu(summary, winners.join("-"))).toBeGreaterThan(STARTING_MU);
			expect(teamMu(summary, losers.join("-"))).toBeLessThan(STARTING_MU);
		},
	);

	test("a team that wins two sets gains more team rating than after winning one", () => {
		const oneWin = summarize({
			results: [sweep({ winnerSide: "opponent1" })],
		});
		const twoWins = summarize({
			results: [
				sweep({ winnerSide: "opponent1" }),
				sweep({ winnerSide: "opponent1" }),
			],
		});

		expect(teamMu(twoWins, "1-2-3-4")).toBeGreaterThan(
			teamMu(oneWin, "1-2-3-4") ?? Number.POSITIVE_INFINITY,
		);
	});

	test("matches count of players and lineups is the number of sets they played", () => {
		const summary = summarize({
			results: [
				sweep({ winnerSide: "opponent1" }),
				sweep({ winnerSide: "opponent2" }),
			],
		});

		for (const userId of [...TEAM_ONE, ...TEAM_TWO]) {
			expect(
				summary.skills.find((s) => s.userId === userId)?.matchesCount,
			).toBe(2);
		}
		for (const identifier of ["1-2-3-4", "5-6-7-8"]) {
			expect(
				summary.skills.find((s) => s.identifier === identifier)?.matchesCount,
			).toBe(2);
		}
	});

	test("the lineup that played most of the set gets the team rating even when a sub played the first map", () => {
		const regularLineup: Array<[number, number[]]> = [
			[1, TEAM_ONE],
			[2, TEAM_TWO],
		];
		const summary = summarize({
			results: [
				playedSet({
					maps: [
						playedMap({
							winnerTeamId: 2,
							lineups: [
								[1, [1, 20, 3, 4]],
								[2, TEAM_TWO],
							],
						}),
						playedMap({ winnerTeamId: 1, lineups: regularLineup }),
						playedMap({ winnerTeamId: 1, lineups: regularLineup }),
					],
				}),
			],
		});

		expect(teamMu(summary, "1-2-3-4")).toBeDefined();
		expect(teamMu(summary, "1-3-4-20")).toBeUndefined();
	});

	test("a lost map is recorded as a loss and not a win on that stage and mode", () => {
		const lineups: Array<[number, number[]]> = [
			[1, TEAM_ONE],
			[2, TEAM_TWO],
		];
		const summary = summarize({
			results: [
				playedSet({
					maps: [
						playedMap({ winnerTeamId: 2, lineups, mode: "SZ", stageId: 1 }),
						playedMap({ winnerTeamId: 1, lineups, mode: "TC", stageId: 2 }),
						playedMap({ winnerTeamId: 1, lineups, mode: "RM", stageId: 3 }),
					],
				}),
			],
		});

		expect(
			summary.mapResultDeltas.find(
				(r) => r.userId === 1 && r.mode === "SZ" && r.stageId === 1,
			),
		).toMatchObject({ wins: 0, losses: 1 });
	});

	test("playing the same stage and mode several times adds up into one record", () => {
		const lineups: Array<[number, number[]]> = [
			[1, TEAM_ONE],
			[2, TEAM_TWO],
		];
		const summary = summarize({
			results: [
				playedSet({
					winnerSide: "opponent1",
					maps: [
						playedMap({ winnerTeamId: 2, lineups }),
						playedMap({ winnerTeamId: 1, lineups }),
						playedMap({ winnerTeamId: 1, lineups }),
					],
				}),
				playedSet({
					winnerSide: "opponent2",
					maps: [
						playedMap({ winnerTeamId: 1, lineups }),
						playedMap({ winnerTeamId: 2, lineups }),
						playedMap({ winnerTeamId: 2, lineups }),
					],
				}),
			],
		});

		expect(summary.mapResultDeltas.filter((r) => r.userId === 1)).toMatchObject(
			[{ mode: "SZ", stageId: 1, wins: 3, losses: 3 }],
		);
	});

	test("players never get a teammate or opponent result against themselves", () => {
		const summary = summarize();

		expect(
			summary.playerResultDeltas.filter((r) => r.ownerUserId === r.otherUserId),
		).toEqual([]);
	});

	test("teams get no A/B division label when the finals are not A/B divisions even if they were assigned one", () => {
		const summary = summarize({
			teamsWithAbDivisions: [
				{ id: 1, abDivision: 0 },
				{ id: 2, abDivision: 1 },
				{ id: 3, abDivision: 0 },
				{ id: 4, abDivision: 1 },
			],
		});

		for (const result of summary.tournamentResults) {
			expect(result.div).toBeNull();
			expect(result.participantCount).toBe(4);
		}
	});

	test("participant count of an A/B division only counts the teams in that division", () => {
		const summary = summarize({
			teamsWithAbDivisions: [
				{ id: 1, abDivision: 0 },
				{ id: 2, abDivision: 0 },
				{ id: 3, abDivision: 0 },
				{ id: 4, abDivision: 1 },
			],
			progression: [
				{
					name: "Groups stage",
					type: "round_robin",
					settings: { hasAbDivisions: true, teamsPerGroup: 4 },
					requiresCheckIn: false,
				},
			],
		});

		const participantCountOf = (teamId: number) =>
			summary.tournamentResults.find((r) => r.tournamentTeamId === teamId)
				?.participantCount;

		expect(participantCountOf(1)).toBe(3);
		expect(participantCountOf(4)).toBe(1);
	});

	test("participant count of a starting bracket only counts the teams that started in it", () => {
		const summary = summarize({
			teamsWithStartingBrackets: [
				{ id: 1, startingBracketIdx: 0 },
				{ id: 2, startingBracketIdx: 0 },
				{ id: 3, startingBracketIdx: 0 },
				{ id: 4, startingBracketIdx: 1 },
			],
			progression: [
				{
					name: "Division 1",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
				{
					name: "Division 2",
					type: "single_elimination",
					settings: {},
					requiresCheckIn: false,
				},
			],
		});

		const participantCountOf = (teamId: number) =>
			summary.tournamentResults.find((r) => r.tournamentTeamId === teamId)
				?.participantCount;

		expect(participantCountOf(1)).toBe(3);
		expect(participantCountOf(4)).toBe(1);
	});

	test("only members of the two teams in a set get a set result for it", () => {
		const summary = summarize({
			results: [
				sweep({
					winnerSide: "opponent1",
					opponentOneId: 3,
					opponentTwoId: 4,
					opponentOneLineup: [9, 10, 11, 12],
					opponentTwoLineup: [13, 14, 15, 16],
				}),
			],
		});

		expect(Array.from(summary.setResults.keys()).sort((a, b) => a - b)).toEqual(
			[9, 10, 11, 12, 13, 14, 15, 16],
		);
	});
});

describe("summaryRatingTargets", () => {
	test("targets the rosters of a set a team dropped out of before any map was played", () => {
		const targets = summaryRatingTargets([
			{
				maps: [],
				opponentOne: createOpponent(1, 0, false, TEAM_ONE),
				opponentTwo: createOpponent(2, 0, true, TEAM_TWO),
				winnerSide: "opponent1",
				roundMaps: { count: 3, type: "BEST_OF" },
			},
		]);

		expect(targets.userIds.sort((a, b) => a - b)).toEqual([
			...TEAM_ONE,
			...TEAM_TWO,
		]);
		expect(targets.identifiers.toSorted((a, b) => a.localeCompare(b))).toEqual([
			"1-2-3-4",
			"5-6-7-8",
		]);
	});

	test("targets the lineups that played the maps, not the registered roster", () => {
		const subLineup = [1, 3, 4, 20];
		const targets = summaryRatingTargets([
			{
				...sweep({ winnerSide: "opponent1", opponentOneLineup: subLineup }),
				opponentOne: createOpponent(1, 2, false, null, [1, 2, 3, 4, 20]),
			},
		]);

		expect(targets.userIds.sort((a, b) => a - b)).toEqual([
			1, 3, 4, 5, 6, 7, 8, 20,
		]);
		expect(targets.identifiers.toSorted((a, b) => a.localeCompare(b))).toEqual([
			"1-3-4-20",
			"5-6-7-8",
		]);
	});
});
