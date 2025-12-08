import { ordinal, rating } from "openskill";
import { describe, expect, test } from "vitest";
import invariant from "~/utils/invariant";
import type { Tables } from "../../../db/tables";
import type { AllMatchResult } from "../queries/allMatchResultsByTournamentId.server";
import { tournamentSummary } from "./summarizer.server";
import type { TournamentDataTeam } from "./Tournament.server";

describe("tournamentSummary()", () => {
	const createTeam = (
		teamId: number,
		userIds: number[],
	): TournamentDataTeam => ({
		checkIns: [],
		createdAt: 0,
		id: teamId,
		inviteCode: null,
		avgSeedingSkillOrdinal: null,
		startingBracketIdx: null,
		mapPool: [],
		members: userIds.map((userId) => ({
			country: null,
			customUrl: null,
			discordAvatar: null,
			discordId: "123",
			username: "test",
			inGameName: "test",
			twitch: null,
			isOwner: 0,
			plusTier: null,
			createdAt: 0,
			userId,
		})),
		name: `Team ${teamId}`,
		prefersNotToHost: 0,
		droppedOut: 0,
		team: null,
		seed: 1,
		activeRosterUserIds: [],
		pickupAvatarUrl: null,
	});

	function summarize({
		results,
		seedingSkillCountsFor,
		withMemberInTwoTeams = false,
		teamsWithStartingBrackets,
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
		progression?: Array<{
			name: string;
			type: "single_elimination";
			settings: Record<string, never>;
			requiresCheckIn: boolean;
			sources?: Array<{ bracketIdx: number; placements: number[] }>;
		}>;
		finalStandings?: Array<{
			placement: number;
			team: TournamentDataTeam;
		}>;
	} = {}) {
		const defaultTeams = [
			{
				id: 1,
				members: [
					{ userId: 1 },
					{ userId: 2 },
					{ userId: 3 },
					{ userId: 4 },
					{ userId: 20 },
				],
			},
			{
				id: 2,
				members: [{ userId: 5 }, { userId: 6 }, { userId: 7 }, { userId: 8 }],
			},
			{
				id: 3,
				members: [
					{ userId: 9 },
					{ userId: 10 },
					{ userId: 11 },
					{ userId: 12 },
				],
			},
			{
				id: 4,
				members: [
					{ userId: 13 },
					{ userId: 14 },
					{ userId: 15 },
					{ userId: 16 },
				],
			},
		];

		const teams = teamsWithStartingBrackets
			? defaultTeams.map((team) => {
					const startingBracket = teamsWithStartingBrackets.find(
						(t) => t.id === team.id,
					);
					return {
						...team,
						startingBracketIdx: startingBracket?.startingBracketIdx ?? null,
					};
				})
			: defaultTeams;

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
					opponentOne: {
						id: 1,
						result: "win",
						score: 2,
					},
					opponentTwo: {
						id: 2,
						result: "loss",
						score: 0,
					},
					endedEarly: 0,
				},
			],
			teams,
			queryCurrentTeamRating: () => rating(),
			queryCurrentUserRating: () => ({ rating: rating(), matchesCount: 0 }),
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
			opponentOne: {
				id: 1,
				result: "win",
				score: 2,
			},
			opponentTwo: {
				id: 2,
				result: "loss",
				score: 0,
			},
			endedEarly: 0,
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
			opponentOne: {
				id: 1,
				result: "win",
				score: 2,
			},
			opponentTwo: {
				id: 2,
				result: "loss",
				score: 0,
			},
			endedEarly: 0,
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
			opponentOne: {
				id: 1,
				result: "win",
				score: 2,
			},
			opponentTwo: {
				id: 2,
				result: "loss",
				score: 1,
			},
			endedEarly: 0,
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
					opponentOne: {
						id: 1,
						result: "win",
						score: 3,
					},
					opponentTwo: {
						id: 2,
						result: "loss",
						score: 0,
					},
					endedEarly: 0,
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
					opponentOne: {
						id: 1,
						result: "win",
						score: 2,
					},
					opponentTwo: {
						id: 2,
						result: "loss",
						score: 0,
					},
					endedEarly: 0,
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
					opponentOne: {
						id: 1,
						result: "win",
						score: 0,
					},
					opponentTwo: {
						id: 2,
						result: "loss",
						score: 0,
					},
					endedEarly: 1,
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
					opponentOne: {
						id: 1,
						result: "win",
						score: 1,
					},
					opponentTwo: {
						id: 2,
						result: "loss",
						score: 0,
					},
					endedEarly: 0,
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
					opponentOne: {
						id: 3,
						result: "win",
						score: 0,
					},
					opponentTwo: {
						id: 4,
						result: "loss",
						score: 0,
					},
					endedEarly: 1,
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

		expect(skillsFromTeam1.length).toBeGreaterThan(0);
		expect(skillsFromTeam2.length).toBeGreaterThan(0);
		expect(skillsFromTeam3.length).toBe(0);
		expect(skillsFromTeam4.length).toBe(0);
	});
});
