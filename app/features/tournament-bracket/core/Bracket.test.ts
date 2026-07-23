import * as R from "remeda";
import { describe, expect, it } from "vitest";
import invariant from "../../../utils/invariant";
import * as Engine from "./engine";
import { EngineBracket } from "./engine/test-utils";
import { Tournament } from "./Tournament";
import { PADDLING_POOL_255 } from "./tests/mocks";
import { LOW_INK_DECEMBER_2024 } from "./tests/mocks-li";
import { testTournament, tournamentCtxTeam } from "./tests/test-utils";

const TEAM_ERROR_404_ID = 17354;
const TEAM_THIS_IS_FINE_ID = 17513;

describe("swiss standings - losses against tied", () => {
	it("should calculate losses against tied", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
			simulateBrackets: false,
		});

		const standing = tournament
			.bracketByIdx(0)
			?.currentStandings(false)
			.find((standing) => standing.team.id === TEAM_THIS_IS_FINE_ID);

		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(1);
	});

	it("breaks ties on losses against tied, not wins against tied", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
			simulateBrackets: false,
		});

		const standings = tournament.bracketByIdx(0)!.currentStandings(false);

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

	it("ranks fewer losses against tied above a higher opponent set win %", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
			simulateBrackets: false,
		});

		const standings = tournament.bracketByIdx(0)!.currentStandings(false);

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

	it("should ignore early dropped out teams for standings (losses against tied)", () => {
		const tournament = new Tournament({
			...LOW_INK_DECEMBER_2024(),
			simulateBrackets: false,
		});

		const standing = tournament
			.bracketByIdx(0)
			?.currentStandings(false)
			.find((standing) => standing.team.id === TEAM_ERROR_404_ID);
		invariant(standing, "Standing not found");

		expect(standing.stats?.lossesAgainstTied).toBe(0); // they lost against "Tidy Tidings" but that team dropped out before final round
	});

	const inProgressSwissTestTournament = () => {
		const data = Engine.create({
			tournamentId: 1,
			name: "Swiss",
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

	it("should handle a team with only one bye", () => {
		const tournament = inProgressSwissTestTournament();

		const standings = tournament.bracketByIdx(0)!.currentStandings(true);

		const teamWithBye = standings.find((standing) => standing.team.id === 3);

		expect(teamWithBye?.stats?.opponentMapWinPercentage).toBe(0);
		expect(teamWithBye?.stats?.opponentSetWinPercentage).toBe(0);
		expect(teamWithBye?.stats?.setWins).toBe(1);
		expect(teamWithBye?.stats?.setLosses).toBe(0);
		expect(teamWithBye?.stats?.mapWins).toBe(2);
		expect(teamWithBye?.stats?.setLosses).toBe(0);
	});

	it("team with only unfinished matches should not be in the current standings", () => {
		const tournament = inProgressSwissTestTournament();

		const standings = tournament.bracketByIdx(0)!.currentStandings(true);

		const playingTeam = standings.find((standing) => standing.team.id === 1);

		expect(playingTeam).toBe(undefined);
	});
});

describe("round robin standings", () => {
	it("should sort teams primarily by set wins (per group) in paddling pool 255", () => {
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

	it("has ascending order from lower group id to higher group id for same placements", () => {
		const tournamentPP255 = new Tournament(PADDLING_POOL_255());

		const standings = tournamentPP255.bracketByIdx(0)!.standings;

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

				expect(
					current.groupId,
					`Team with ID ${current.team.id} in wrong spot relative to ${next.team.id}`,
				).toBeLessThan(next.groupId!);
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
		const bracket = new EngineBracket();

		bracket.create({
			name: "RR",
			tournamentId: 1,
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
			const match = bracket.match(matchId);
			const winnerIsOpp1 = match.opponent1?.id === winnerId;
			bracket.updateMatch({
				id: match.id,
				opponent1: winnerIsOpp1
					? { score: winnerScore, result: "win" }
					: { score: loserScore },
				opponent2: winnerIsOpp1
					? { score: loserScore }
					: { score: winnerScore, result: "win" },
			});
		};

		// Mimics endDroppedTeamMatches: sets a winner via result only, with no
		// score recorded on either side (the match was never actually played).
		const forfeitMatch = (matchId: number, winnerId: number) => {
			const match = bracket.match(matchId);
			bracket.updateMatch({
				id: match.id,
				opponent1: {
					result: match.opponent1?.id === winnerId ? "win" : "loss",
				},
				opponent2: {
					result: match.opponent2?.id === winnerId ? "win" : "loss",
				},
			});
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
		for (const match of bracket.matches()) {
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

		const data = bracket.data!;

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

	it("should not credit wins against a team that dropped out before completing all of their matches", () => {
		// Team 4 dropped out before playing their match against team 3.
		const tournament = droppedOutTournament({ skipMatchups: ["3-4"] });
		const standings = tournament.bracketByIdx(0)!.currentStandings(true);

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

	it("should still count matches against a team that dropped out only after all of their matches were reported", () => {
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

	it("should not credit wins against a team that dropped out before completing all of their matches (forfeit-closed)", () => {
		// Production scenario: team 4 dropped before playing 3-4, then admin's
		// drop action ran endDroppedTeamMatches which closed 3-4 with a result
		// (team 3 marked winner) but no score on either side. Wins against team
		// 4 should still be excluded from tiebreakers — same intent as the
		// skipMatchups variant above, but matching the real production shape.
		const tournament = droppedOutTournament({ forfeitMatchups: ["3-4"] });
		const standings = tournament.bracketByIdx(0)!.currentStandings(true);

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

	it("should report relevantMatchesFinished=true when a dropped team's remaining matches were forfeited (no score)", () => {
		const tournament = droppedOutTournament({ forfeitMatchups: ["3-4"] });

		const { relevantMatchesFinished } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1] });

		expect(relevantMatchesFinished).toBe(true);
	});

	it("includes a fully-forfeited dropped team in standings", () => {
		const tournament = droppedOutTournament({ forfeitMatchups: ["3-4"] });
		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings.map((s) => s.team.id)).toContain(4);
	});
});

describe("round robin A/B divisions standings", () => {
	const abDivisionsTournament = () => {
		const bracket = new EngineBracket();

		bracket.create({
			name: "AB RR",
			tournamentId: 1,
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
			const match = bracket.match(matchId);
			const winnerIsOpp1 = match.opponent1?.id === winnerId;
			bracket.updateMatch({
				id: match.id,
				opponent1: winnerIsOpp1
					? { score: winnerScore, result: "win" }
					: { score: loserScore },
				opponent2: winnerIsOpp1
					? { score: loserScore }
					: { score: winnerScore, result: "win" },
			});
		};

		const winnerByMatchup: Record<string, number> = {
			"1-2": 1,
			"1-4": 1,
			"2-3": 2,
			"3-4": 3,
		};
		for (const match of bracket.matches()) {
			const a = match.opponent1!.id as number;
			const b = match.opponent2!.id as number;
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			const winnerId = winnerByMatchup[key];
			invariant(winnerId, `unexpected matchup ${key}`);
			const loserScore = key === "2-3" || key === "3-4" ? 1 : 0;
			setResult(match.id, winnerId, 2, loserScore);
		}

		const data = bracket.data!;

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

	it("filtering by abDivision preserves standard tiebreaker order within each division", () => {
		const tournament = abDivisionsTournament();
		const standings = tournament.bracketByIdx(0)!.currentStandings(true);

		expect(standings.map((s) => s.team.id)).toEqual([1, 2, 3, 4]);

		const divisionA = standings.filter((s) => s.team.abDivision === 0);
		const divisionB = standings.filter((s) => s.team.abDivision === 1);

		expect(divisionA.map((s) => s.team.id)).toEqual([1, 3]);
		expect(divisionB.map((s) => s.team.id)).toEqual([2, 4]);
	});

	it("source({ placements: [1] }) returns top team from each division", () => {
		const tournament = abDivisionsTournament();
		const { teams } = tournament.bracketByIdx(0)!.source({ placements: [1] });

		expect(teams).toEqual([1, 2]);
	});

	it("source({ placements: [1, 2] }) returns top two teams from each division", () => {
		const tournament = abDivisionsTournament();
		const { teams } = tournament
			.bracketByIdx(0)!
			.source({ placements: [1, 2] });

		expect(teams).toHaveLength(4);
		expect(new Set(teams)).toEqual(new Set([1, 2, 3, 4]));
		expect(teams.slice(0, 2)).toEqual([1, 3]);
		expect(teams.slice(2, 4)).toEqual([2, 4]);
	});

	it("source ignores placements beyond division size", () => {
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
		const bracket = new EngineBracket();

		bracket.create({
			name: "SE",
			tournamentId: 1,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { consolationFinal: true },
		});

		const reportLowerTeamIdAsWinner = (matchId: number) => {
			bracket.updateMatch({
				id: matchId,
				opponent1: { score: 2, result: "win" },
				opponent2: { score: 0 },
			});
		};

		const semifinals = bracket
			.matches()
			.filter((match) => match.opponent1?.id && match.opponent2?.id);
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
				...bracket.groups().map((group) => group.id),
			);
			const thirdPlaceMatch = bracket
				.matches()
				.find((match) => match.group_id === thirdPlaceGroupId);
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
			data: bracket.data!,
		});

		return { tournament, thirdPlaceWinnerId, thirdPlaceLoserId };
	};

	it("excludes semifinal losers from standings before the third place match concludes", () => {
		const { tournament } = singleEliminationTournament({
			thirdPlaceMatchReported: false,
		});

		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings).toHaveLength(0);
	});

	it("places third place match winner 3rd and loser 4th once it is played", () => {
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

const reportLowerIdWinner = (bracket: EngineBracket, matchId: number) => {
	const match = bracket.match(matchId);
	const opponent1Lower = match.opponent1!.id! < match.opponent2!.id!;
	bracket.updateMatch({
		id: matchId,
		opponent1: opponent1Lower ? { score: 2, result: "win" } : { score: 0 },
		opponent2: opponent1Lower ? { score: 0 } : { score: 2, result: "win" },
	});
};

const readyMatches = (
	bracket: EngineBracket,
	predicate: (match: ReturnType<EngineBracket["matches"]>[number]) => boolean,
) =>
	bracket
		.matches()
		.filter(
			(match) =>
				predicate(match) &&
				match.opponent1?.id != null &&
				match.opponent2?.id != null &&
				match.opponent1.result == null &&
				match.opponent2.result == null,
		);

describe("single elimination standings - projected ties", () => {
	// Two semifinal losers tie for 3rd (no consolation final). Reports only one
	// semifinal so the other is still in progress, mirroring the projected
	// standings bug where the finished team is shown one placement too low.
	const partialSingleEliminationTournament = () => {
		const bracket = new EngineBracket();

		bracket.create({
			name: "SE",
			tournamentId: 1,
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		const semifinals = bracket
			.matches()
			.filter((match) => match.opponent1?.id && match.opponent2?.id);
		invariant(semifinals.length === 2, "Expected two semifinal matches");

		const decided = semifinals[0];
		const decidedLoserId = Math.max(
			decided.opponent1!.id!,
			decided.opponent2!.id!,
		);
		reportLowerIdWinner(bracket, decided.id);

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
			data: bracket.data!,
		});

		return { tournament, decidedLoserId };
	};

	it("projects a finished semifinal loser as tied 3rd before the other semifinal finishes", () => {
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
		const bracket = new EngineBracket();

		bracket.create({
			name: "DE",
			tournamentId: 1,
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		const groupId = (number: number) =>
			bracket.groups().find((g) => g.number === number)!.id;
		const winnersGroupId = groupId(1);
		const losersGroupId = groupId(2);

		const losersRoundId = (number: number) =>
			bracket
				.rounds()
				.find((r) => r.group_id === losersGroupId && r.number === number)!.id;

		// play out the entire winners bracket so all losers feed in
		let winnersReady = readyMatches(
			bracket,
			(m) => m.group_id === winnersGroupId,
		);
		while (winnersReady.length) {
			for (const match of winnersReady) {
				reportLowerIdWinner(bracket, match.id);
			}
			winnersReady = readyMatches(
				bracket,
				(m) => m.group_id === winnersGroupId,
			);
		}

		// losers round 1: both matches -> two teams eliminated, tied 7th/8th
		for (const match of readyMatches(
			bracket,
			(m) => m.round_id === losersRoundId(1),
		)) {
			reportLowerIdWinner(bracket, match.id);
		}

		// losers round 2: report only one of the two matches
		const losersRound2 = readyMatches(
			bracket,
			(m) => m.round_id === losersRoundId(2),
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
		reportLowerIdWinner(bracket, decided.id);

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
			data: bracket.data!,
		});

		return { tournament, decidedLoserId, stillPlayingTeamIds };
	};

	it("projects a finished losers-round-2 loser as tied 5th before the sibling match finishes", () => {
		const { tournament, decidedLoserId } = partialDoubleEliminationTournament();

		const standings = tournament.bracketByIdx(0)!.standings;

		expect(standings.find((s) => s.team.id === decidedLoserId)?.placement).toBe(
			5,
		);
	});

	it("does not yet place teams still playing their losers round 2 match", () => {
		const { tournament, stillPlayingTeamIds } =
			partialDoubleEliminationTournament();

		const standings = tournament.bracketByIdx(0)!.standings;

		for (const teamId of stillPlayingTeamIds) {
			expect(standings.find((s) => s.team.id === teamId)).toBe(undefined);
		}
	});
});
