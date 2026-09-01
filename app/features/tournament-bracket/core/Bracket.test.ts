import * as R from "remeda";
import { describe, expect, test } from "vitest";
import invariant from "../../../utils/invariant";
import * as Engine from "./engine";
import { createResolved } from "./engine/create";
import type { BracketData, MatchData } from "./engine/types";
import { Tournament } from "./Tournament";
import { PADDLING_POOL_255 } from "./tests/mocks";
import { LOW_INK_DECEMBER_2024 } from "./tests/mocks-li";
import { testTournament, tournamentCtxTeam } from "./tests/test-utils";

const TEAM_ERROR_404_ID = 17354;
const TEAM_THIS_IS_FINE_ID = 17513;

describe("swiss standings - losses against tied", () => {
	test("calculates losses against tied", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
		});

		const standing = tournament
			.bracketByIdx(0)
			?.standings.find((standing) => standing.team.id === TEAM_THIS_IS_FINE_ID);

		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(1);
	});

	test("breaks ties on losses against tied, not wins against tied", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
		});

		const standings = tournament.bracketByIdx(0)!.standings;

		// Both teams finished 4-2 in the same Swiss group. Team 16872 beat MORE of
		// its tied peers (winsAgainstTied=2) than team 17505 (winsAgainstTied=1),
		// but Swiss intentionally ranks on losses against tied (not wins), because
		// not every tied team has played each other. Both lost to zero tied peers,
		// so the tiebreaker is a draw and the higher opponent set win % wins out —
		// placing 17505 above 16872 despite 16872's extra win against a tied team.
		const moreWinsVsTied = standings.find((s) => s.team.id === 16872);
		const higherOpponentWinPct = standings.find((s) => s.team.id === 17505);
		invariant(moreWinsVsTied && higherOpponentWinPct, "Standings not found");

		expect(moreWinsVsTied.stats?.winsAgainstTied).toBe(2);
		expect(higherOpponentWinPct.stats?.winsAgainstTied).toBe(1);
		expect(moreWinsVsTied.stats?.lossesAgainstTied).toBe(0);
		expect(higherOpponentWinPct.stats?.lossesAgainstTied).toBe(0);

		expect(higherOpponentWinPct.placement).toBeLessThan(
			moreWinsVsTied.placement,
		);
	});

	test("ranks fewer losses against tied above a higher opponent set win %", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
		});

		const standings = tournament.bracketByIdx(0)!.standings;

		// Both teams finished 4-2 in the same Swiss group. Team 16996 lost to none
		// of its tied peers while team 17067 lost to one, even though 17067 has the
		// higher opponent set win %. The losses-against-tied tiebreaker is applied
		// before opponent win %, so 16996 is placed higher.
		const noTiedLosses = standings.find((s) => s.team.id === 16996);
		const oneTiedLoss = standings.find((s) => s.team.id === 17067);
		invariant(noTiedLosses && oneTiedLoss, "Standings not found");

		expect(noTiedLosses.stats?.lossesAgainstTied).toBe(0);
		expect(oneTiedLoss.stats?.lossesAgainstTied).toBe(1);
		expect(oneTiedLoss.stats?.opponentSetWinPercentage).toBeGreaterThan(
			noTiedLosses.stats!.opponentSetWinPercentage!,
		);

		expect(noTiedLosses.placement).toBeLessThan(oneTiedLoss.placement);
	});

	test("ignores early dropped out teams for standings (losses against tied)", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
		});

		const standing = tournament
			.bracketByIdx(0)
			?.standings.find((standing) => standing.team.id === TEAM_ERROR_404_ID);
		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(0); // they lost against "Tidy Tidings" but that team dropped out before final round
	});

	test("ignores a dropped out team with an identical record (losses against tied)", () => {
		const data = Engine.create({
			type: "swiss",
			seeding: [1, 2, 3, 4, 5, 6],
			settings: { groupCount: 1, roundCount: 3 },
		});

		const playedMatch = (
			id: number,
			roundIdx: number,
			number: number,
			winnerId: number,
			loserId: number,
		): MatchData => ({
			id,
			stageId: data.stage[0].id,
			groupId: data.group[0].id,
			roundId: data.round[roundIdx].id,
			number,
			opponent1: { id: winnerId },
			opponent2: { id: loserId },
			winnerSide: "opponent1",
		});

		// teams 1 and 6 both finish 2-1; team 1's only loss is to team 6,
		// who dropped out after the swiss ended
		data.match = [
			playedMatch(0, 0, 1, 1, 2),
			playedMatch(1, 0, 2, 3, 4),
			playedMatch(2, 0, 3, 5, 6),
			playedMatch(3, 1, 1, 1, 3),
			playedMatch(4, 1, 2, 2, 5),
			playedMatch(5, 1, 3, 6, 4),
			playedMatch(6, 2, 1, 6, 1),
			playedMatch(7, 2, 2, 3, 5),
			playedMatch(8, 2, 3, 2, 4),
		];

		const tournament = testTournament({
			data,
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "swiss",
							name: "Main Bracket",
							requiresCheckIn: false,
							settings: {},
						},
					],
				},
				teams: [1, 2, 3, 4, 5, 6].map((teamId) =>
					tournamentCtxTeam(teamId, { droppedOut: teamId === 6 ? 1 : 0 }),
				),
			},
		});

		const standing = tournament
			.bracketByIdx(0)
			?.standings.find((standing) => standing.team.id === 1);
		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(0);
	});

	const inProgressSwissTestTournament = () => {
		const data = Engine.create({
			type: "swiss",
			seeding: [1, 2, 3],
			settings: {
				groupCount: 1,
				roundCount: 5,
			},
		});

		// needed to make it "not preview"
		data.round = data.round.map((r) => ({
			...r,
			maps: { count: 3, type: "BEST_OF" },
		}));

		return testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "swiss",
							name: "Swiss",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data,
		});
	};

	test("handles a team with only one bye", () => {
		const tournament = inProgressSwissTestTournament();

		const standings = tournament.bracketByIdx(0)!.liveStandings;

		const teamWithBye = standings.find((standing) => standing.team.id === 3);

		expect(teamWithBye?.stats?.opponentMapWinPercentage).toBe(0);
		expect(teamWithBye?.stats?.opponentSetWinPercentage).toBe(0);
		expect(teamWithBye?.stats?.setWins).toBe(1);
		expect(teamWithBye?.stats?.setLosses).toBe(0);
		expect(teamWithBye?.stats?.mapWins).toBe(2);
		expect(teamWithBye?.stats?.setLosses).toBe(0);
	});

	test("team with only unfinished matches should be in the current standings with blank stats", () => {
		const tournament = inProgressSwissTestTournament();

		const standings = tournament.bracketByIdx(0)!.liveStandings;

		const playingTeam = standings.find((standing) => standing.team.id === 1);

		expect(playingTeam?.stats?.setWins).toBe(0);
		expect(playingTeam?.stats?.setLosses).toBe(0);
	});
});

describe("swiss standings - cross group ties", () => {
	// Two Swiss groups of four playing one round. Group 1 is won by seed 3 (who beat
	// seed 7), group 2 by seed 6 (who upset seed 2). Both are 1st of their group, and
	// the upset gives seed 6 the better effective seed of the two.
	const twoGroupSwissTournament = () => {
		let data = Engine.create({
			type: "swiss",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: { groupCount: 2, roundCount: 1 },
		});

		const winnerByMatchup: Record<string, number> = {
			"1-5": 5,
			"3-7": 3,
			"2-6": 6,
			"4-8": 8,
		};
		for (const match of data.match) {
			const one = match.opponent1!.id as number;
			const two = match.opponent2!.id as number;
			const key = one < two ? `${one}-${two}` : `${two}-${one}`;
			const winnerId = winnerByMatchup[key];
			invariant(winnerId, `unexpected matchup ${key}`);
			const winnerIsOpp1 = one === winnerId;
			data = Engine.reportResult(data, {
				matchId: match.id,
				scores: [winnerIsOpp1 ? 2 : 0, winnerIsOpp1 ? 0 : 2],
				winnerSide: winnerIsOpp1 ? "opponent1" : "opponent2",
			}).data;
		}

		return testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "swiss",
							name: "Swiss",
							requiresCheckIn: false,
							settings: { groupCount: 2, roundCount: 1 },
							sources: [],
						},
					],
				},
			},
			data,
		});
	};

	test("ranks the group winner with the better effective seed first", () => {
		const standings = twoGroupSwissTournament().bracketByIdx(0)!.standings;

		const upsetWinnerIdx = standings.findIndex((s) => s.team.id === 6);
		const otherWinnerIdx = standings.findIndex((s) => s.team.id === 3);

		expect(standings[upsetWinnerIdx].placement).toBe(
			standings[otherWinnerIdx].placement,
		);
		// without the effective seed tiebreak the lower groupId (seed 3's group) wins
		expect(upsetWinnerIdx).toBeLessThan(otherWinnerIdx);
	});
});

describe("swiss standings - rematches between tied teams", () => {
	// 4-team Swiss with 5 rounds, so rounds 4 and 5 are forced rematches. Teams 1
	// and 2 finish 4-1, having met twice and split 1-1 (team 1 won the round 1
	// meeting, team 2 the round 4 one), so head-to-head is even and opponent set
	// win % should decide: team 2's opponents won 12 of 25 sets (48%), team 1's
	// 10 of 25 (40%).
	const swissTournamentWithRematches = () => {
		const data = Engine.create({
			type: "swiss",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1, roundCount: 5 },
		});

		const roundResults: Array<Array<[winnerId: number, loserId: number]>> = [
			[
				[1, 2],
				[3, 4],
			],
			[
				[1, 3],
				[2, 4],
			],
			[
				[1, 4],
				[2, 3],
			],
			[
				[2, 1],
				[3, 4],
			],
			[
				[1, 4],
				[2, 3],
			],
		];

		data.match = roundResults.flatMap((results, roundIdx) =>
			results.map(
				([winnerId, loserId], matchIdx): MatchData => ({
					id: roundIdx * 2 + matchIdx,
					stageId: data.stage[0].id,
					groupId: data.group[0].id,
					roundId: data.round[roundIdx].id,
					number: matchIdx + 1,
					opponent1: { id: winnerId, score: 2 },
					opponent2: { id: loserId, score: 0 },
					winnerSide: "opponent1",
				}),
			),
		);

		return testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "swiss",
							name: "Swiss",
							requiresCheckIn: false,
							settings: { groupCount: 1, roundCount: 5 },
							sources: [],
						},
					],
				},
			},
			data,
		});
	};

	test("counts every meeting between tied teams for the head-to-head tiebreaker", () => {
		const standings = swissTournamentWithRematches().bracketByIdx(0)!.standings;

		const team1 = standings.find((s) => s.team.id === 1)!;
		const team2 = standings.find((s) => s.team.id === 2)!;

		expect(team2.placement).toBe(1);
		expect(team1.stats?.lossesAgainstTied).toBe(1);
		expect(team2.stats?.winsAgainstTied).toBe(1);
	});
});

describe("round robin standings", () => {
	test("sorts teams primarily by set wins (per group) in paddling pool 255", () => {
		const tournamentPP255 = new Tournament(PADDLING_POOL_255());

		const standings = tournamentPP255.bracketByIdx(0)!.standings;

		const groupIds = R.unique(standings.map((standing) => standing.groupId));
		expect(
			groupIds.length,
			"Paddling Pool 255 should have groups from Group A to Group I",
		).toBe(9);

		for (const groupId of groupIds) {
			const groupStandings = standings.filter(
				(standing) => standing.groupId === groupId,
			);

			for (let i = 0; i < groupStandings.length; i++) {
				const current = groupStandings[i];
				const next = groupStandings[i + 1];

				if (!next) {
					break;
				}

				expect(
					current.stats!.setWins,
					`Team with ID ${current.team.id} in wrong spot relative to ${next.team.id}`,
				).toBeGreaterThanOrEqual(next.stats!.setWins);
			}
		}
	});

	test("breaks same placement ties across groups by effective seed (own seed or best seed beaten)", () => {
		const tournamentPP255 = new Tournament(PADDLING_POOL_255());
		const bracket = tournamentPP255.bracketByIdx(0)!;

		const standings = bracket.standings;

		const effectiveSeed = (tournamentTeamId: number) => {
			let best = tournamentPP255.teamById(tournamentTeamId)!.seed!;
			for (const match of bracket.data.match) {
				if (!match.winnerSide) continue;

				const winner =
					match.winnerSide === "opponent1" ? match.opponent1 : match.opponent2;
				const loser =
					match.winnerSide === "opponent1" ? match.opponent2 : match.opponent1;
				if (winner?.id !== tournamentTeamId || !loser?.id) continue;

				const loserSeed = tournamentPP255.teamById(loser.id)!.seed!;
				best = Math.min(best, loserSeed);
			}
			return best;
		};

		const placements = R.unique(
			standings.map((standing) => standing.placement),
		).sort((a, b) => a - b);

		for (const placement of placements) {
			const placementStandings = standings.filter(
				(standing) => standing.placement === placement,
			);

			for (let i = 0; i < placementStandings.length; i++) {
				const current = placementStandings[i];
				const next = placementStandings[i + 1];

				if (!next) {
					break;
				}

				// strictly less: an effective seed is either the team's own (unique) seed
				// or the seed of a team it beat, and two teams that beat the same team
				// share a group and therefore cannot share a placement. The comparator's
				// groupId fallback is unreachable as long as that holds.
				expect(
					effectiveSeed(current.team.id),
					`Team with ID ${current.team.id} in wrong spot relative to ${next.team.id}`,
				).toBeLessThan(effectiveSeed(next.team.id));
			}
		}
	});
});

describe("round robin standings - dropped out teams", () => {
	const droppedOutTournament = ({
		skipMatchups = [],
		forfeitMatchups = [],
	}: {
		skipMatchups?: string[];
		forfeitMatchups?: string[];
	} = {}) => {
		let data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			settings: {
				groupCount: 1,
			},
		});

		const setResult = (
			matchId: number,
			winnerId: number,
			winnerScore: number,
			loserScore: number,
		) => {
			const match = matchById(data, matchId);
			const winnerIsOpp1 = match.opponent1?.id === winnerId;
			data = Engine.reportResult(data, {
				matchId,
				scores: [
					winnerIsOpp1 ? winnerScore : loserScore,
					winnerIsOpp1 ? loserScore : winnerScore,
				],
				winnerSide: winnerIsOpp1 ? "opponent1" : "opponent2",
			}).data;
		};

		// Mimics endDroppedTeamMatches: sets a winner via result only, with no
		// score recorded on either side (the match was never actually played).
		const forfeitMatch = (matchId: number, winnerId: number) => {
			const match = matchById(data, matchId);
			data = Engine.reportResult(data, {
				matchId,
				winnerSide:
					match.opponent1?.id === winnerId ? "opponent1" : "opponent2",
			}).data;
		};

		// Team 1 beat everyone, team 2 beat 3 and 4, team 3 beat 4.
		const winnerByMatchup: Record<string, number> = {
			"1-2": 1,
			"1-3": 1,
			"1-4": 1,
			"2-3": 2,
			"2-4": 2,
			"3-4": 3,
		};
		for (const match of data.match) {
			const a = match.opponent1!.id as number;
			const b = match.opponent2!.id as number;
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (skipMatchups.includes(key)) continue;
			const winnerId = winnerByMatchup[key];
			invariant(winnerId, `unexpected matchup ${key}`);
			if (forfeitMatchups.includes(key)) {
				forfeitMatch(match.id, winnerId);
			} else {
				setResult(match.id, winnerId, 2, 0);
			}
		}

		return testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "round_robin",
							name: "RR",
							requiresCheckIn: false,
							settings: {},
						},
					],
				},
				teams: [
					tournamentCtxTeam(1, { seed: 1 }),
					tournamentCtxTeam(2, { seed: 2 }),
					tournamentCtxTeam(3, { seed: 3 }),
					tournamentCtxTeam(4, { seed: 4, droppedOut: 1 }),
				],
			},
			data,
		});
	};

	test("does not credit wins against a team that dropped out before completing all of their matches", () => {
		// Team 4 dropped out before playing their match against team 3.
		const tournament = droppedOutTournament({ skipMatchups: ["3-4"] });
		const standings = tournament.bracketByIdx(0)!.liveStandings;

		const team1Standing = standings.find((s) => s.team.id === 1);
		const team2Standing = standings.find((s) => s.team.id === 2);
		const team3Standing = standings.find((s) => s.team.id === 3);

		expect(team1Standing?.stats?.setWins).toBe(2);
		expect(team1Standing?.stats?.setLosses).toBe(0);

		expect(team2Standing?.stats?.setWins).toBe(1);
		expect(team2Standing?.stats?.setLosses).toBe(1);

		expect(team3Standing?.stats?.setWins).toBe(0);
		expect(team3Standing?.stats?.setLosses).toBe(2);
	});

	test("stills count matches against a team that dropped out only after all of their matches were reported", () => {
		const tournament = droppedOutTournament();
		const standings = tournament.bracketByIdx(0)!.standings;

		const team1Standing = standings.find((s) => s.team.id === 1);
		const team2Standing = standings.find((s) => s.team.id === 2);
		const team3Standing = standings.find((s) => s.team.id === 3);

		expect(team1Standing?.stats?.setWins).toBe(3);
		expect(team1Standing?.stats?.setLosses).toBe(0);

		expect(team2Standing?.stats?.setWins).toBe(2);
		expect(team2Standing?.stats?.setLosses).toBe(1);

		expect(team3Standing?.stats?.setWins).toBe(1);
		expect(team3Standing?.stats?.setLosses).toBe(2);
	});

	test("does not credit wins against a team that dropped out before completing all of their matches (forfeit-closed)", () => {
		// Production scenario: team 4 dropped before playing 3-4, then admin's
		// drop action ran endDroppedTeamMatches which closed 3-4 with a result
		// (team 3 marked winner) but no score on either side. Wins against team
		// 4 should still be excluded from tiebreakers — same intent as the
		// skipMatchups variant above, but matching the real production shape.
		const tournament = droppedOutTournament({ forfeitMatchups: ["3-4"] });
		const standings = tournament.bracketByIdx(0)!.liveStandings;

		const team1Standing = standings.find((s) => s.team.id === 1);
		const team2Standing = standings.find((s) => s.team.id === 2);
		const team3Standing = standings.find((s) => s.team.id === 3);

		expect(team1Standing?.stats?.setWins).toBe(2);
		expect(team1Standing?.stats?.setLosses).toBe(0);

		expect(team2Standing?.stats?.setWins).toBe(1);
		expect(team2Standing?.stats?.setLosses).toBe(1);

		expect(team3Standing?.stats?.setWins).toBe(0);
		expect(team3Standing?.stats?.setLosses).toBe(2);
	});

	test("reports relevantMatchesFinished=true when a dropped team's remaining matches were forfeited (no score)", () => {
		const tournament = droppedOutTournament({ forfeitMatchups: ["3-4"] });

		const { relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1] });

		expect(relevantMatchesFinished).toBe(true);
	});

	test("includes a fully-forfeited dropped team in standings", () => {
		const tournament = droppedOutTournament({ forfeitMatchups: ["3-4"] });
		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toContain(4);
	});

	// 5 teams and 2 groups produce a 3-team group and a 2-team group. The
	// only opponent of the 2-team group's other team drops out before playing,
	// so the surviving team has no non-forfeited matches at all.
	const twoTeamGroupDropoutTournament = () => {
		let data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4, 5],
			settings: {
				groupCount: 2,
			},
		});

		const matchCountByGroupId = new Map<number, number>();
		for (const match of data.match) {
			matchCountByGroupId.set(
				match.groupId,
				(matchCountByGroupId.get(match.groupId) ?? 0) + 1,
			);
		}
		const twoTeamGroupId = [...matchCountByGroupId.entries()].find(
			([, count]) => count === 1,
		)?.[0];
		invariant(
			typeof twoTeamGroupId === "number",
			"no 2-team group in the fixture",
		);

		let droppedOutTeamId: number | null = null;
		let survivingTeamId: number | null = null;

		for (const match of data.match) {
			const opponent1Id = match.opponent1!.id as number;
			const opponent2Id = match.opponent2!.id as number;

			if (match.groupId === twoTeamGroupId) {
				// the higher seed no-showed and was dropped by the TO;
				// endDroppedTeamMatches closes the match with a winner but no score
				droppedOutTeamId = Math.max(opponent1Id, opponent2Id);
				survivingTeamId = Math.min(opponent1Id, opponent2Id);
				data = Engine.reportResult(data, {
					matchId: match.id,
					winnerSide:
						match.opponent1?.id === survivingTeamId ? "opponent1" : "opponent2",
				}).data;
				continue;
			}

			const winnerIsOpp1 = opponent1Id < opponent2Id;
			data = Engine.reportResult(data, {
				matchId: match.id,
				scores: winnerIsOpp1 ? [2, 0] : [0, 2],
				winnerSide: winnerIsOpp1 ? "opponent1" : "opponent2",
			}).data;
		}

		invariant(droppedOutTeamId !== null && survivingTeamId !== null);

		return {
			tournament: testTournament({
				ctx: {
					settings: {
						bracketProgression: [
							{
								type: "round_robin",
								name: "RR",
								requiresCheckIn: false,
								settings: {},
							},
						],
					},
					teams: [1, 2, 3, 4, 5].map((teamId) =>
						tournamentCtxTeam(teamId, {
							seed: teamId,
							droppedOut: teamId === droppedOutTeamId ? 1 : 0,
						}),
					),
				},
				data,
			}),
			survivingTeamId,
		};
	};

	test("includes a team whose every group opponent dropped out in standings", () => {
		const { tournament, survivingTeamId } = twoTeamGroupDropoutTournament();
		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toContain(survivingTeamId);
	});

	test("reports relevantMatchesFinished=true when a 2-team group ended via drop out", () => {
		const { tournament } = twoTeamGroupDropoutTournament();

		const { relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1] });

		expect(relevantMatchesFinished).toBe(true);
	});
});

describe("round robin A/B divisions standings", () => {
	const abDivisionsTournament = () => {
		let data = createResolved({
			type: "round_robin",
			seeding: [1, 2, 3, 4],
			abDivisions: [0, 1, 0, 1],
			settings: {
				groupCount: 1,
				hasAbDivisions: true,
			},
		});

		const setResult = (
			matchId: number,
			winnerId: number,
			winnerScore: number,
			loserScore: number,
		) => {
			const match = matchById(data, matchId);
			const winnerIsOpp1 = match.opponent1?.id === winnerId;
			data = Engine.reportResult(data, {
				matchId,
				scores: [
					winnerIsOpp1 ? winnerScore : loserScore,
					winnerIsOpp1 ? loserScore : winnerScore,
				],
				winnerSide: winnerIsOpp1 ? "opponent1" : "opponent2",
			}).data;
		};

		const winnerByMatchup: Record<string, number> = {
			"1-2": 1,
			"1-4": 1,
			"2-3": 2,
			"3-4": 3,
		};
		for (const match of data.match) {
			const a = match.opponent1!.id as number;
			const b = match.opponent2!.id as number;
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			const winnerId = winnerByMatchup[key];
			invariant(winnerId, `unexpected matchup ${key}`);
			const loserScore = key === "2-3" || key === "3-4" ? 1 : 0;
			setResult(match.id, winnerId, 2, loserScore);
		}

		return testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "round_robin",
							name: "AB RR",
							requiresCheckIn: false,
							settings: { hasAbDivisions: true },
						},
					],
				},
				teams: [
					tournamentCtxTeam(1, { abDivision: 0, seed: 1 }),
					tournamentCtxTeam(2, { abDivision: 1, seed: 2 }),
					tournamentCtxTeam(3, { abDivision: 0, seed: 3 }),
					tournamentCtxTeam(4, { abDivision: 1, seed: 4 }),
				],
			},
			data,
		});
	};

	test("filtering by abDivision preserves standard tiebreaker order within each division", () => {
		const tournament = abDivisionsTournament();
		const standings = tournament.bracketByIdx(0)!.liveStandings;

		expect(standings.map((s) => s.team.id)).toEqual([1, 2, 3, 4]);

		const divisionA = standings.filter((s) => s.team.abDivision === 0);
		const divisionB = standings.filter((s) => s.team.abDivision === 1);

		expect(divisionA.map((s) => s.team.id)).toEqual([1, 3]);
		expect(divisionB.map((s) => s.team.id)).toEqual([2, 4]);
	});

	test("source({ placements: [1] }) returns top team from each division", () => {
		const tournament = abDivisionsTournament();
		const { teams } = tournament.bracketByIdx(0)!.source({ placements: [1] });

		expect(teams).toEqual([1, 2]);
	});

	test("source({ placements: [1, 2] }) returns top two teams from each division", () => {
		const tournament = abDivisionsTournament();
		const { teams } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1, 2] });

		expect(teams).toHaveLength(4);
		expect(new Set(teams)).toEqual(new Set([1, 2, 3, 4]));
		expect(teams.slice(0, 2)).toEqual([1, 3]);
		expect(teams.slice(2, 4)).toEqual([2, 4]);
	});

	test("source ignores placements beyond division size", () => {
		const tournament = abDivisionsTournament();
		const { teams } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1, 5] });

		expect(teams).toEqual([1, 2]);
	});
});

describe("single elimination standings - third place match", () => {
	const singleEliminationTournament = ({
		thirdPlaceMatchReported,
	}: {
		thirdPlaceMatchReported: boolean;
	}) => {
		let data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { consolationFinal: true },
		});

		const reportLowerTeamIdAsWinner = (matchId: number) => {
			data = Engine.reportResult(data, {
				matchId,
				scores: [2, 0],
				winnerSide: "opponent1",
			}).data;
		};

		const semifinals = data.match.filter(
			(match) => match.opponent1?.id && match.opponent2?.id,
		);
		invariant(semifinals.length === 2, "Expected two semifinal matches");

		const semifinalLoserIds: number[] = [];
		for (const match of semifinals) {
			semifinalLoserIds.push(match.opponent2!.id!);
			reportLowerTeamIdAsWinner(match.id);
		}

		let thirdPlaceWinnerId: number | undefined;
		let thirdPlaceLoserId: number | undefined;
		if (thirdPlaceMatchReported) {
			const thirdPlaceGroupId = Math.max(
				...data.group.map((group) => group.id),
			);
			const thirdPlaceMatch = data.match.find(
				(match) => match.groupId === thirdPlaceGroupId,
			);
			invariant(thirdPlaceMatch, "Third place match not found");
			thirdPlaceWinnerId = thirdPlaceMatch.opponent1!.id!;
			thirdPlaceLoserId = thirdPlaceMatch.opponent2!.id!;
			reportLowerTeamIdAsWinner(thirdPlaceMatch.id);
		}

		const tournament = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "single_elimination",
							name: "SE",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data,
		});

		return { tournament, thirdPlaceWinnerId, thirdPlaceLoserId };
	};

	test("excludes semifinal losers from standings before the third place match concludes", () => {
		const { tournament } = singleEliminationTournament({
			thirdPlaceMatchReported: false,
		});

		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings).toHaveLength(0);
	});

	test("places third place match winner 3rd and loser 4th once it is played", () => {
		const { tournament, thirdPlaceWinnerId, thirdPlaceLoserId } =
			singleEliminationTournament({
				thirdPlaceMatchReported: true,
			});

		const standings = tournament.bracketByIdx(0)!.standings;

		expect(
			standings.find((s) => s.team.id === thirdPlaceWinnerId)?.placement,
		).toBe(3);
		expect(
			standings.find((s) => s.team.id === thirdPlaceLoserId)?.placement,
		).toBe(4);
	});
});

describe("single elimination standings - byes in later rounds", () => {
	// Brackets created before the current engine paired the padded seeding
	// naturally, so the byes ended up next to each other and could fill both
	// sides of a first round match. The current engine spreads byes with
	// `space_between`, which makes this impossible to create today, but such
	// brackets are still stored (tournament 1252's playoffs is one). A first
	// round match that is a bye on both sides leaves the second round match it
	// feeds with a single opponent, so that match is won against a bye. The
	// semifinal won that way produces no loser, leaving only one team for the
	// third place match, which can therefore never be played.
	const legacyByeBracketData = (): BracketData => {
		const stageId = 0;
		const thirdPlaceRoundId = 3;

		const match = (
			id: number,
			roundId: number,
			number: number,
			opponent1: number | null,
			opponent2: number | null,
			winnerSide: MatchData["winnerSide"],
		): MatchData => ({
			id,
			stageId,
			groupId: roundId === thirdPlaceRoundId ? 1 : 0,
			roundId,
			number,
			opponent1: opponent1 === null ? null : { id: opponent1 },
			opponent2: opponent2 === null ? null : { id: opponent2 },
			winnerSide,
		});

		return {
			stage: [
				{
					id: stageId,
					type: "single_elimination",
					settings: { consolationFinal: true },
					number: 1,
				},
			],
			group: [
				{ id: 0, stageId, number: 1 },
				{ id: 1, stageId, number: 2 },
			],
			round: [
				{ id: 0, stageId, groupId: 0, number: 1 },
				{ id: 1, stageId, groupId: 0, number: 2 },
				{ id: 2, stageId, groupId: 0, number: 3 },
				{ id: thirdPlaceRoundId, stageId, groupId: 1, number: 1 },
			],
			match: [
				match(0, 0, 1, 1, 2, "opponent1"),
				match(1, 0, 2, 3, 4, "opponent1"),
				match(2, 0, 3, 5, 6, "opponent1"),
				// six teams in an eight team bracket, both byes landed here
				match(3, 0, 4, null, null, null),
				match(4, 1, 1, 1, 3, "opponent1"),
				// won against a bye
				match(5, 1, 2, 5, null, "opponent1"),
				match(6, 2, 1, 1, 5, "opponent1"),
				// only one semifinal produced a loser
				match(7, thirdPlaceRoundId, 1, 3, null, null),
			],
		};
	};

	const legacyByeTournament = () =>
		testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "single_elimination",
							name: "SE",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data: legacyByeBracketData(),
		});

	test("places every team when a match is won against a bye", () => {
		const tournament = legacyByeTournament();

		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings.map((s) => [s.team.id, s.placement])).toEqual([
			[1, 1],
			[5, 2],
			[3, 3],
			[2, 4],
			[4, 4],
			[6, 4],
		]);
	});

	test("gives third place to the only semifinal loser when the third place match is a bye", () => {
		const tournament = legacyByeTournament();

		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings.find((s) => s.team.id === 3)?.placement).toBe(3);
	});
});

describe("single elimination standings - projected ties", () => {
	// Two semifinal losers tie for 3rd (no consolation final). Reports only one
	// semifinal so the other is still in progress, mirroring the projected
	// standings bug where the finished team is shown one placement too low.
	const partialSingleEliminationTournament = () => {
		let data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		const semifinals = data.match.filter(
			(match) => match.opponent1?.id && match.opponent2?.id,
		);
		invariant(semifinals.length === 2, "Expected two semifinal matches");

		const decided = semifinals[0];
		const decidedLoserId = Math.max(
			decided.opponent1!.id!,
			decided.opponent2!.id!,
		);
		data = reportLowerIdWinner(data, decided.id);

		const tournament = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "single_elimination",
							name: "SE",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data,
		});

		return { tournament, decidedLoserId };
	};

	test("projects a finished semifinal loser as tied 3rd before the other semifinal finishes", () => {
		const { tournament, decidedLoserId } = partialSingleEliminationTournament();

		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings.find((s) => s.team.id === decidedLoserId)?.placement).toBe(
			3,
		);
	});
});

describe("double elimination standings - projected ties", () => {
	// 8-team DE: losers round 2 produces the 5th/6th tie. Plays out the whole
	// winners bracket and losers round 1, then reports only one of the two
	// losers round 2 matches so its loser should already project to tied 5th
	// while the sibling match is still unfinished.
	const partialDoubleEliminationTournament = () => {
		let data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		const groupId = (number: number) =>
			data.group.find((group) => group.number === number)!.id;
		const winnersGroupId = groupId(1);
		const losersGroupId = groupId(2);

		const losersRoundId = (number: number) =>
			data.round.find(
				(round) => round.groupId === losersGroupId && round.number === number,
			)!.id;

		// play out the entire winners bracket so all losers feed in
		let winnersReady = readyMatches(data, (m) => m.groupId === winnersGroupId);
		while (winnersReady.length) {
			for (const match of winnersReady) {
				data = reportLowerIdWinner(data, match.id);
			}
			winnersReady = readyMatches(data, (m) => m.groupId === winnersGroupId);
		}

		// losers round 1: both matches -> two teams eliminated, tied 7th/8th
		for (const match of readyMatches(
			data,
			(m) => m.roundId === losersRoundId(1),
		)) {
			data = reportLowerIdWinner(data, match.id);
		}

		// losers round 2: report only one of the two matches
		const losersRound2 = readyMatches(
			data,
			(m) => m.roundId === losersRoundId(2),
		);
		invariant(losersRound2.length === 2, "Expected two losers round 2 matches");

		const decided = losersRound2[0];
		const decidedLoserId = Math.max(
			decided.opponent1!.id!,
			decided.opponent2!.id!,
		);
		const stillPlayingTeamIds = [
			losersRound2[1].opponent1!.id,
			losersRound2[1].opponent2!.id,
		];
		data = reportLowerIdWinner(data, decided.id);

		const tournament = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "double_elimination",
							name: "DE",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data,
		});

		return { tournament, decidedLoserId, stillPlayingTeamIds };
	};

	test("projects a finished losers-round-2 loser as tied 5th before the sibling match finishes", () => {
		const { tournament, decidedLoserId } = partialDoubleEliminationTournament();

		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings.find((s) => s.team.id === decidedLoserId)?.placement).toBe(
			5,
		);
	});

	test("does not yet place teams still playing their losers round 2 match", () => {
		const { tournament, stillPlayingTeamIds } =
			partialDoubleEliminationTournament();

		const standings = tournament.bracketByIdx(0)!.standings;

		for (const teamId of stillPlayingTeamIds) {
			expect(standings.find((s) => s.team.id === teamId)).toBe(undefined);
		}
	});
});

describe("single elimination source - underground", () => {
	// 8-team SE played out fully. The four first-round losers tie for last, so
	// sourcing [-1] should feed exactly those teams into an underground bracket.
	const playedSingleEliminationTournament = () => {
		let data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		const winnersGroupId = data.group.find((group) => group.number === 1)!.id;
		const firstRoundId = data.round.find(
			(round) => round.groupId === winnersGroupId && round.number === 1,
		)!.id;

		// lower id wins, so the higher id in each first-round match is the loser
		const firstRoundLoserIds = readyMatches(
			data,
			(match) => match.roundId === firstRoundId,
		).map((match) => Math.max(match.opponent1!.id!, match.opponent2!.id!));

		let ready = readyMatches(data, (match) => match.groupId === winnersGroupId);
		while (ready.length) {
			for (const match of ready) {
				data = reportLowerIdWinner(data, match.id);
			}
			ready = readyMatches(data, (match) => match.groupId === winnersGroupId);
		}

		const tournament = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "single_elimination",
							name: "SE",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data,
		});

		return { tournament, firstRoundLoserIds };
	};

	test("sources the first-round losers when placements are [-1]", () => {
		const { tournament, firstRoundLoserIds } =
			playedSingleEliminationTournament();

		const { teams, relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [-1] });

		expect(relevantMatchesFinished).toBe(true);
		expect([...teams].sort((a, b) => a - b)).toEqual(
			[...firstRoundLoserIds].sort((a, b) => a - b),
		);
	});
});

describe("single elimination source - positive placements", () => {
	// 8-team SE without a third place match; lower id always wins so the final
	// standings are 1st: team 1, 2nd: team 2, tied 3rd: teams 3 & 4, tied 5th: the rest
	const singleEliminationTournament = ({
		playedRounds,
	}: {
		playedRounds: "all" | "first";
	}) => {
		let data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		if (playedRounds === "first") {
			for (const match of readyMatches(data, () => true)) {
				data = reportLowerIdWinner(data, match.id);
			}
		} else {
			let ready = readyMatches(data, () => true);
			while (ready.length) {
				for (const match of ready) {
					data = reportLowerIdWinner(data, match.id);
				}
				ready = readyMatches(data, () => true);
			}
		}

		return testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "single_elimination",
							name: "SE",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data,
		});
	};

	test("sources the winner when placements are [1]", () => {
		const tournament = singleEliminationTournament({ playedRounds: "all" });

		const { teams, relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1] });

		expect(relevantMatchesFinished).toBe(true);
		expect(teams).toEqual([1]);
	});

	test("sources the top 2 when placements are [1, 2]", () => {
		const tournament = singleEliminationTournament({ playedRounds: "all" });

		const { teams, relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1, 2] });

		expect(relevantMatchesFinished).toBe(true);
		expect(teams).toEqual([1, 2]);
	});

	test("sources both tied semifinal losers when placements are [3]", () => {
		const tournament = singleEliminationTournament({ playedRounds: "all" });

		const { teams } = tournament.bracketByIdx(0)!.source({ placements: [3] });

		expect([...teams].sort((a, b) => a - b)).toEqual([3, 4]);
	});

	test("reports relevant matches unfinished while the bracket is underway", () => {
		const tournament = singleEliminationTournament({ playedRounds: "first" });

		const { teams, relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1] });

		expect(relevantMatchesFinished).toBe(false);
		expect(teams).toEqual([]);
	});
});

describe("double elimination source - positive placements", () => {
	// 4-team DE; lower id always wins so the grand finals winner is team 1 and no
	// bracket reset is played, leaving the standings 1st: team 1 ... 4th: team 4
	const doubleEliminationTournament = ({
		playedRounds,
	}: {
		playedRounds: "all" | "first";
	}) => {
		let data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		if (playedRounds === "first") {
			for (const match of readyMatches(data, () => true)) {
				data = reportLowerIdWinner(data, match.id);
			}
		} else {
			let ready = readyMatches(data, () => true);
			while (ready.length) {
				for (const match of ready) {
					data = reportLowerIdWinner(data, match.id);
				}
				ready = readyMatches(data, () => true);
			}
		}

		return testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							type: "double_elimination",
							name: "DE",
							requiresCheckIn: false,
							settings: {},
							sources: [],
						},
					],
				},
			},
			data,
		});
	};

	test("sources the winner when placements are [1]", () => {
		const tournament = doubleEliminationTournament({ playedRounds: "all" });

		const { teams, relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1] });

		expect(relevantMatchesFinished).toBe(true);
		expect(teams).toEqual([1]);
	});

	test("sources the top 2 when placements are [1, 2]", () => {
		const tournament = doubleEliminationTournament({ playedRounds: "all" });

		const { teams, relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1, 2] });

		expect(relevantMatchesFinished).toBe(true);
		expect(teams).toEqual([1, 2]);
	});

	test("reports relevant matches unfinished while the bracket is underway", () => {
		const tournament = doubleEliminationTournament({ playedRounds: "first" });

		const { teams, relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1] });

		expect(relevantMatchesFinished).toBe(false);
		expect(teams).toEqual([]);
	});
});

describe("swiss between rounds", () => {
	const SWISS_MAIN_BRACKET = {
		type: "swiss" as const,
		name: "Main Bracket",
		requiresCheckIn: false,
		settings: { groupCount: 1, roundCount: 5 },
		sources: [],
	};

	// swiss with round 1 fully reported but rounds 2-5 not yet paired
	const betweenRoundsSwissData = () => {
		let data = Engine.create({
			type: "swiss",
			seeding: [1, 2, 3, 4],
			settings: { groupCount: 1, roundCount: 5 },
		});

		// needed to make it "not preview"
		data.round = data.round.map((r) => ({
			...r,
			maps: { count: 3, type: "BEST_OF" },
		}));

		for (const match of data.match) {
			data = reportLowerIdWinner(data, match.id);
		}

		return data;
	};

	test("tournament is not over while swiss still has unpaired rounds", () => {
		const tournament = testTournament({
			ctx: {
				settings: { bracketProgression: [SWISS_MAIN_BRACKET] },
			},
			data: betweenRoundsSwissData(),
		});

		expect(tournament.everyBracketOver).toBe(false);
	});

	test("can't finalize between swiss rounds when progression also has an underground bracket", () => {
		const tournament = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						SWISS_MAIN_BRACKET,
						{
							type: "single_elimination" as const,
							name: "Underground Bracket",
							requiresCheckIn: false,
							settings: {},
							sources: [{ bracketIdx: 0, placements: [3, 4] }],
						},
					],
				},
			},
			data: betweenRoundsSwissData(),
		});

		expect(tournament.canFinalize({ id: 1 })).toBe(false);
	});
});

describe("single elimination sourcing - placements are tiers", () => {
	const TEAM_IDS = Array.from({ length: 16 }, (_, index) => index + 1);

	const SE_TO_TOP_4 = [
		{
			type: "single_elimination" as const,
			name: "Main Bracket",
			requiresCheckIn: false,
			settings: { thirdPlaceMatch: false },
		},
		{
			type: "single_elimination" as const,
			name: "Top 4",
			requiresCheckIn: false,
			settings: { thirdPlaceMatch: false },
			sources: [{ bracketIdx: 0, placements: [1, 2, 3, 4] }],
		},
	];

	/** Plays the bracket out in match order, the lower team id always winning, stopping after `maxMatches`. */
	const playOut = (maxMatches: number) => {
		let data = createResolved({
			type: "single_elimination",
			seeding: TEAM_IDS,
			settings: { consolationFinal: false },
		});

		for (let played = 0; played < maxMatches; played++) {
			const [pending] = readyMatches(data, () => true);
			if (!pending) break;

			data = reportLowerIdWinner(data, pending.id);
		}

		return data;
	};

	const top4Seeding = (data: BracketData) =>
		testTournament({
			ctx: {
				settings: { bracketProgression: SE_TO_TOP_4 },
				teams: TEAM_IDS.map((id) => tournamentCtxTeam(id, { seed: id })),
			},
			data,
		})
			.bracketByIdx(1)!
			.seeding!.toSorted((a, b) => a - b);

	test("sources only the semifinal losers while the final is unplayed", () => {
		const beforeFinal = playOut(14);

		expect(top4Seeding(beforeFinal)).toEqual([3, 4]);
	});

	// without a third place match the placements are 1, 2, 3, 3, 5, 5, 5, 5, 9...
	// so placements 1-4 are the four best tiers: the quarterfinal losers advance as the fourth
	test("sources the 1st, the 2nd, both 3rd and all four 5th placed teams for placements 1-4 once the final is played", () => {
		const afterFinal = playOut(15);

		expect(top4Seeding(afterFinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});
});

function reportLowerIdWinner(data: BracketData, matchId: number): BracketData {
	const match = matchById(data, matchId);
	const opponent1Lower = match.opponent1!.id! < match.opponent2!.id!;

	return Engine.reportResult(data, {
		matchId,
		scores: [opponent1Lower ? 2 : 0, opponent1Lower ? 0 : 2],
		winnerSide: opponent1Lower ? "opponent1" : "opponent2",
	}).data;
}

function readyMatches(
	data: BracketData,
	predicate: (match: MatchData) => boolean,
) {
	return data.match.filter(
		(match) =>
			predicate(match) &&
			match.opponent1?.id != null &&
			match.opponent2?.id != null &&
			match.winnerSide == null,
	);
}

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
