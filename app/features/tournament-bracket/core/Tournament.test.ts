import { describe, expect, test } from "vitest";
import type {
	BracketData,
	GeneratedRound,
	MatchData,
} from "~/features/tournament-bracket/core/engine/types";
import { unwrap } from "~/utils/result";
import * as Engine from "./engine";
import type * as Progression from "./Progression";
import { Tournament } from "./Tournament";
import {
	IN_THE_ZONE_32,
	PADDLING_POOL_255,
	PADDLING_POOL_257,
} from "./tests/mocks";
import { SWIM_OR_SINK_167 } from "./tests/mocks-sos";
import {
	progressions,
	testTournament,
	tournamentCtxTeam,
} from "./tests/test-utils";

describe("Follow-up bracket progression", () => {
	const tournamentPP257 = new Tournament(PADDLING_POOL_257());
	const tournamentPP255 = new Tournament(PADDLING_POOL_255());
	const tournamentITZ32 = new Tournament(IN_THE_ZONE_32({}));
	const tournamentITZ32UndergroundWithoutCheckIn = new Tournament(
		IN_THE_ZONE_32({ undergroundRequiresCheckIn: false }),
	);
	const tournamentITZ32UndergroundWithoutCheckInWithCheckedOut = new Tournament(
		IN_THE_ZONE_32({
			undergroundRequiresCheckIn: false,
			hasCheckedOutTeam: true,
		}),
	);

	test("correct amount of teams in the top cut", () => {
		expect(tournamentPP257.brackets[1].seeding?.length).toBe(18);
	});

	test("includes correct teams in the top cut", () => {
		for (const tournamentTeamId of [892, 882, 881]) {
			expect(
				tournamentPP257.brackets[1].seeding?.some(
					(team) => team === tournamentTeamId,
				),
			).toBe(true);
		}
	});

	test("underground bracket includes a checked in team", () => {
		expect(
			tournamentPP257.brackets[2].seeding?.some((team) => team === 902),
		).toBe(true);
	});

	test("underground bracket doesn't include a non checked in team", () => {
		expect(
			tournamentPP257.brackets[2].seeding?.some((team) => team === 902),
		).toBe(true);
	});

	test("underground bracket includes checked in teams (DE->SE)", () => {
		expect(tournamentITZ32.brackets[1].seeding?.length).toBe(4);
	});

	test("underground bracket includes all teams if does not require check in (DE->SE)", () => {
		expect(
			tournamentITZ32UndergroundWithoutCheckIn.brackets[1].seeding?.length,
		).toBe(16);
	});

	test("underground bracket excludes checked out teams", () => {
		expect(
			tournamentITZ32UndergroundWithoutCheckInWithCheckedOut.brackets[1].seeding
				?.length,
		).toBe(15);
	});

	const AMOUNT_OF_WORSE_VS_BEST = 5;
	const AMOUNT_OF_BEST_VS_BEST = 1;
	const AMOUNT_OF_WORSE_VS_WORSE = 2;

	test("correct seed distribution in the top cut", () => {
		const rrPlacements = tournamentPP257.brackets[0].standings;

		let ACTUAL_AMOUNT_OF_WORSE_VS_BEST = 0;
		let ACTUAL_AMOUNT_OF_BEST_VS_BEST = 0;
		let ACTUAL_AMOUNT_OF_WORSE_VS_WORSE = 0;
		for (const match of tournamentPP257.brackets[1].data.match) {
			const opponent1 = rrPlacements.find(
				(placement) => placement.team.id === match.opponent1?.id,
			);
			const opponent2 = rrPlacements.find(
				(placement) => placement.team.id === match.opponent2?.id,
			);

			if (!opponent1 || !opponent2) {
				continue;
			}

			const placementDiff = opponent1.placement - opponent2.placement;
			if (placementDiff === 0 && opponent1.placement === 1) {
				ACTUAL_AMOUNT_OF_BEST_VS_BEST++;
			} else if (placementDiff === 0 && opponent1.placement === 10) {
				ACTUAL_AMOUNT_OF_WORSE_VS_WORSE++;
			} else {
				ACTUAL_AMOUNT_OF_WORSE_VS_BEST++;
			}
		}

		expect(
			ACTUAL_AMOUNT_OF_WORSE_VS_BEST,
			"Amount of worse vs best is incorrect",
		).toBe(AMOUNT_OF_WORSE_VS_BEST);
		expect(
			ACTUAL_AMOUNT_OF_WORSE_VS_WORSE,
			"Amount of worse vs worse is incorrect",
		).toBe(AMOUNT_OF_WORSE_VS_WORSE);
		expect(
			ACTUAL_AMOUNT_OF_BEST_VS_BEST,
			"Amount of best vs best is incorrect",
		).toBe(AMOUNT_OF_BEST_VS_BEST);
	});

	const validateNoRematches = (
		rrMatches: MatchData[],
		topCutMatches: MatchData[],
	) => {
		for (const topCutMatch of topCutMatches) {
			if (!topCutMatch.opponent1?.id || !topCutMatch.opponent2?.id) {
				continue;
			}

			for (const rrMatch of rrMatches) {
				if (
					rrMatch.opponent1?.id === topCutMatch.opponent1.id &&
					rrMatch.opponent2?.id === topCutMatch.opponent2.id
				) {
					throw new Error(
						`Rematch detected: ${rrMatch.opponent1.id} vs ${rrMatch.opponent2.id}`,
					);
				}
				if (
					rrMatch.opponent1?.id === topCutMatch.opponent2.id &&
					rrMatch.opponent2?.id === topCutMatch.opponent1.id
				) {
					throw new Error(
						`Rematch detected: ${rrMatch.opponent1.id} vs ${rrMatch.opponent2.id}`,
					);
				}
			}
		}
	};

	test("avoids rematches in RR -> SE (PP 257)", () => {
		const rrMatches = tournamentPP257.brackets[0].data.match;
		const topCutMatches = tournamentPP257.brackets[1].data.match;

		validateNoRematches(rrMatches, topCutMatches);
	});

	test("avoids rematches in RR -> SE (PP 255)", () => {
		const rrMatches = tournamentPP255.brackets[0].data.match;
		const topCutMatches = tournamentPP255.brackets[1].data.match;

		validateNoRematches(rrMatches, topCutMatches);
	});

	test("group rivals in the top cut can only meet in the final (PP 255)", () => {
		const rrStandings = tournamentPP255.brackets[0].standings;
		const topCut = tournamentPP255.brackets[1];

		// group winners keep the best seeds
		const groupWinnerIds = rrStandings
			.filter((standing) => standing.placement === 1)
			.map((standing) => standing.team.id);
		expect(new Set(topCut.seeding?.slice(0, groupWinnerIds.length))).toEqual(
			new Set(groupWinnerIds),
		);

		// with two teams advancing per group, both should land in opposite
		// halves of the bracket
		const firstRoundId = topCut.data.round[0].id;
		const matchCount = topCut.data.match.filter(
			(match) => match.roundId === firstRoundId,
		).length;
		const halfByTeamId = new Map<number, number>();
		for (const match of topCut.data.match) {
			if (match.roundId !== firstRoundId) continue;

			for (const id of [match.opponent1?.id, match.opponent2?.id]) {
				if (typeof id === "number") {
					halfByTeamId.set(id, match.number <= matchCount / 2 ? 0 : 1);
				}
			}
		}

		const groupIds = new Set(rrStandings.map((standing) => standing.groupId));
		for (const groupId of groupIds) {
			const groupTeamIds = (topCut.seeding ?? []).filter(
				(teamId) =>
					rrStandings.find((standing) => standing.team.id === teamId)
						?.groupId === groupId,
			);

			expect(groupTeamIds).toHaveLength(2);
			expect(halfByTeamId.get(groupTeamIds[0])).not.toBe(
				halfByTeamId.get(groupTeamIds[1]),
			);
		}
	});

	test("initializes an unstarted DE + underground tournament with exactly 2 teams", () => {
		const tournament = testTournament({
			ctx: {
				settings: {
					bracketProgression: progressions.doubleEliminationWithUnderground,
				},
				teams: [tournamentCtxTeam(1), tournamentCtxTeam(2)],
			},
		});

		expect(tournament.brackets).toHaveLength(2);
	});

	// TODO: handle LUTI bracket progression
	// test("avoids rematches in RR -> SE (LUTI S16 Div 1) - avoid as long as possible", () => {
	// 	https://github.com/sendou-ink/sendou.ink/pull/2192
	// });
});

describe("Bracket progression override", () => {
	test("handles no override", () => {
		const tournament = new Tournament({
			...SWIM_OR_SINK_167(),
		});

		expect(tournament.brackets[1].participantTournamentTeamIds).toHaveLength(
			11,
		);
		expect(tournament.brackets[2].participantTournamentTeamIds).toHaveLength(
			11,
		);
		expect(tournament.brackets[3].participantTournamentTeamIds).toHaveLength(
			11,
		);
		expect(tournament.brackets[4].participantTournamentTeamIds).toHaveLength(
			11,
		);
	});

	test("overrides causing the team to go to another bracket", () => {
		const tournament = new Tournament({
			...SWIM_OR_SINK_167([
				{
					tournamentTeamId: 14809,
					destinationBracketIdx: 1,
					sourceBracketIdx: 0,
				},
			]),
		});

		expect(
			tournament.brackets[1].participantTournamentTeamIds.includes(14809),
		).toBeTruthy();
	});

	test("overrides causing the team not to go to their original bracket", () => {
		const tournament = new Tournament({
			...SWIM_OR_SINK_167([
				{
					tournamentTeamId: 14809,
					destinationBracketIdx: 1,
					sourceBracketIdx: 0,
				},
			]),
		});

		expect(
			tournament.brackets[2].participantTournamentTeamIds.includes(14809),
		).toBeFalsy();
	});

	test("destinationBracketIdx = -1 eliminates the team", () => {
		const tournament = new Tournament({
			...SWIM_OR_SINK_167([
				{
					tournamentTeamId: 14809,
					destinationBracketIdx: -1,
					sourceBracketIdx: 0,
				},
			]),
		});

		expect(tournament.brackets[1].participantTournamentTeamIds).toHaveLength(
			11,
		);
		expect(tournament.brackets[2].participantTournamentTeamIds).toHaveLength(
			10,
		);
		expect(tournament.brackets[3].participantTournamentTeamIds).toHaveLength(
			11,
		);
		expect(tournament.brackets[4].participantTournamentTeamIds).toHaveLength(
			11,
		);
	});

	test("override teams seeded at the end", () => {
		const tournament = new Tournament({
			...SWIM_OR_SINK_167([
				{
					tournamentTeamId: 14809,
					destinationBracketIdx: 1,
					sourceBracketIdx: 0,
				},
			]),
		});

		expect(tournament.brackets[1].seeding?.at(-1)).toBe(14809);
	});

	test("if redundant override, still in the right bracket", () => {
		const tournament = new Tournament({
			...SWIM_OR_SINK_167([
				{
					tournamentTeamId: 14809,
					destinationBracketIdx: 2,
					sourceBracketIdx: 0,
				},
			]),
		});

		expect(
			tournament.brackets[2].participantTournamentTeamIds.includes(14809),
		).toBeTruthy();
	});

	test("redundants override does not affect the seed", () => {
		const tournamentTeamId = 14735;
		const tournament = new Tournament({
			...SWIM_OR_SINK_167(),
		});
		const tournamentWOverride = new Tournament({
			...SWIM_OR_SINK_167([
				{
					tournamentTeamId,
					destinationBracketIdx: 2,
					sourceBracketIdx: 0,
				},
			]),
		});

		const seedingIdx =
			tournament.brackets[2].seeding?.indexOf(tournamentTeamId);
		const seedingIdxWOverride =
			tournamentWOverride.brackets[2].seeding?.indexOf(tournamentTeamId);

		expect(typeof seedingIdx === "number").toBeTruthy();
		expect(seedingIdx).toBe(seedingIdxWOverride);
	});

	// note there is also logic for avoiding replays
	test("override teams seeded according to their placement in the source bracket", () => {
		const tournament = new Tournament({
			...SWIM_OR_SINK_167([
				// throw these to different brackets to avoid replays
				{
					tournamentTeamId: 14657,
					destinationBracketIdx: 2,
					sourceBracketIdx: 0,
				},
				{
					tournamentTeamId: 14800,
					destinationBracketIdx: 2,
					sourceBracketIdx: 0,
				},
				{
					tournamentTeamId: 14743,
					destinationBracketIdx: 2,
					sourceBracketIdx: 0,
				},
				// ---
				{
					tournamentTeamId: 14737,
					destinationBracketIdx: 1,
					sourceBracketIdx: 0,
				},
				{
					tournamentTeamId: 14809,
					destinationBracketIdx: 1,
					sourceBracketIdx: 0,
				},
				{
					tournamentTeamId: 14796,
					destinationBracketIdx: 1,
					sourceBracketIdx: 0,
				},
			]),
		});

		expect(tournament.brackets[1].seeding?.at(-3)).toBe(14809);
		expect(tournament.brackets[1].seeding?.at(-2)).toBe(14796);
		expect(tournament.brackets[1].seeding?.at(-1)).toBe(14737);
	});
});

describe("Adjusting team starting bracket", () => {
	const createTournament = (teamStartingBracketIdx: (number | null)[]) => {
		return testTournament({
			ctx: {
				teams: teamStartingBracketIdx.map((startingBracketIdx, i) =>
					tournamentCtxTeam(i + 1, { startingBracketIdx }),
				),
				settings: {
					bracketProgression: progressions.manyStartBrackets,
				},
			},
		});
	};

	test("defaults to bracket idx = 0", () => {
		const tournament = createTournament([null, null, null, null]);

		expect(tournament.brackets[0].participantTournamentTeamIds).toHaveLength(4);
	});

	test("setting starting bracket idx has an effect", () => {
		const tournament = createTournament([0, 0, 1, 1]);

		expect(tournament.brackets[0].participantTournamentTeamIds).toHaveLength(2);
		expect(tournament.brackets[1].participantTournamentTeamIds).toHaveLength(2);
	});

	test("handles too high bracket idx gracefully", () => {
		const tournament = createTournament([0, 0, 0, 10]);

		expect(tournament.brackets[0].participantTournamentTeamIds).toHaveLength(4);
	});

	test("handles bracket idx is not a valid starting bracket idx gracefully", () => {
		// 2 is not valid because it is a follow-up bracket
		const tournament = createTournament([0, 0, 0, 2]);

		expect(tournament.brackets[0].participantTournamentTeamIds).toHaveLength(4);
	});
});

describe("League divisions", () => {
	const leagueTournament = (isLeague = true) =>
		testTournament({
			ctx: {
				teams: [0, 0, 0, 2].map((startingBracketIdx, i) =>
					tournamentCtxTeam(i + 1, { startingBracketIdx }),
				),
				settings: {
					isLeague,
					bracketProgression: progressions.league,
				},
			},
		});

	test("every starting bracket is a division", () => {
		expect(leagueTournament().leagueDivisions.map((div) => div.idx)).toEqual([
			0, 2,
		]);
	});

	test("has no divisions when not a league", () => {
		expect(leagueTournament(false).leagueDivisions).toEqual([]);
	});

	test("playoffs belong to the division they are sourced from", () => {
		expect(leagueTournament().leagueDivisionOfBracket(3)).toBe(2);
	});

	test("brackets of a division exclude the other divisions'", () => {
		expect(
			leagueTournament()
				.visibleBracketsMetaOfDivision(2)
				.map((bracket) => bracket.name),
		).toEqual(["Division 2", "Division 2 Playoffs"]);
	});

	test("every bracket is shown when no division is selected", () => {
		expect(leagueTournament().visibleBracketsMetaOfDivision(null)).toHaveLength(
			4,
		);
	});

	test("teams of a division are the ones starting in it", () => {
		expect(leagueTournament().teamsCountOfBracket(0)).toBe(3);
		expect(leagueTournament().teamsCountOfBracket(2)).toBe(1);
	});
});

describe("Resolving the team a user is a member of", () => {
	const USER_ID = 1;

	const tournamentWithTeams = (
		teams: Array<{ id: number; createdAt: number }>,
		latestTeamIdByDuplicatedUserId: Record<number, number> = {},
	) =>
		testTournament({
			ctx: {
				teams: teams.map((team) =>
					tournamentCtxTeam(team.id, {
						createdAt: team.createdAt,
						memberUserIds: [USER_ID],
					}),
				),
				latestTeamIdByDuplicatedUserId,
			},
		});

	test("resolves the only team the user is a member of", () => {
		const tournament = tournamentWithTeams([{ id: 1, createdAt: 1 }]);

		expect(tournament.teamMemberOfByUser({ id: USER_ID })?.id).toBe(1);
	});

	test("resolves the team the user joined most recently when on many teams", () => {
		// e.g. the user's first team dropped out and the organizer added them to an
		// older team afterwards
		const tournament = tournamentWithTeams(
			[
				{ id: 1, createdAt: 1 },
				{ id: 2, createdAt: 100 },
			],
			{ [USER_ID]: 1 },
		);

		expect(tournament.teamMemberOfByUser({ id: USER_ID })?.id).toBe(1);
	});

	test("falls back to the first team when the most recently joined one is not visible", () => {
		const tournament = tournamentWithTeams(
			[
				{ id: 1, createdAt: 1 },
				{ id: 2, createdAt: 2 },
			],
			{ [USER_ID]: 3 },
		);

		expect(tournament.teamMemberOfByUser({ id: USER_ID })?.id).toBe(1);
	});

	test("returns null if the user is not a member of any team", () => {
		const tournament = tournamentWithTeams([{ id: 1, createdAt: 1 }]);

		expect(tournament.teamMemberOfByUser({ id: USER_ID + 1 })).toBeNull();
	});
});

describe("teamMemberOfProgressStatus in swiss", () => {
	const teamsWithMembers = [1, 2, 3, 4].map((teamId) =>
		tournamentCtxTeam(teamId, { memberUserIds: [100 + teamId] }),
	);

	test("resolves an early advanced team as waiting for the follow-up bracket", () => {
		const data = playOutEarlyAdvanceSwiss(progressions.swissEarlyAdvance);

		const tournament = testTournament({
			data,
			ctx: {
				settings: { bracketProgression: progressions.swissEarlyAdvance },
				teams: teamsWithMembers,
			},
		});

		expect(
			tournament.bracketByIdx(1)?.seeding,
			"test setup: the advanced team should be in the top cut preview",
		).toContain(1);
		expect(tournament.teamMemberOfProgressStatus({ id: 101 })?.type).toBe(
			"WAITING_FOR_BRACKET",
		);
	});

	test("resolves a dropped out team's status as thanks for playing", () => {
		const data = Engine.create({
			type: "swiss",
			seeding: [1, 2, 3, 4],
			settings: {},
		});
		finishPendingMatches(data);

		const tournament = testTournament({
			data,
			ctx: {
				settings: { bracketProgression: progressions.swissOneGroup },
				teams: [1, 2, 3, 4].map((teamId) =>
					tournamentCtxTeam(teamId, {
						memberUserIds: [100 + teamId],
						droppedOut: teamId === 4 ? 1 : 0,
					}),
				),
			},
		});

		expect(tournament.teamMemberOfProgressStatus({ id: 104 })?.type).toBe(
			"THANKS_FOR_PLAYING",
		);
	});
});

describe("Swiss early advance bracket sourcing", () => {
	const progressionWithConsolation: Progression.ParsedBracket[] = [
		{
			name: "Main Bracket",
			type: "swiss",
			requiresCheckIn: false,
			settings: { advanceThreshold: 3 },
		},
		{
			name: "Top Cut",
			type: "single_elimination",
			requiresCheckIn: false,
			settings: {},
			sources: [{ bracketIdx: 0, placements: [] }],
		},
		{
			name: "Consolation",
			type: "single_elimination",
			requiresCheckIn: false,
			settings: {},
			sources: [{ bracketIdx: 0, placements: [2, 3, 4] }],
		},
	];

	test("sources a consolation bracket by its placements instead of the advance threshold", () => {
		const data = playOutEarlyAdvanceSwiss(progressionWithConsolation);

		const tournament = testTournament({
			data,
			ctx: { settings: { bracketProgression: progressionWithConsolation } },
		});

		expect(
			tournament.bracketByIdx(1)?.seeding,
			"test setup: the swiss winner should be in the top cut",
		).toContain(1);
		expect(
			tournament.bracketByIdx(2)?.seeding,
			"the swiss winner advanced to the top cut and should not also be in the consolation bracket",
		).not.toContain(1);
	});
});

describe("teamById division seeds", () => {
	test("assigns unique seeds within a division when a late registrant has null startingBracketIdx", () => {
		const tournament = testTournament({
			ctx: {
				settings: {
					bracketProgression: [
						{
							name: "Div A",
							type: "round_robin",
							requiresCheckIn: false,
							settings: {},
						},
						{
							name: "Div B",
							type: "round_robin",
							requiresCheckIn: false,
							settings: {},
						},
					],
				},
				teams: [
					// DB query orders by seed ASC which puts NULL seeds first in SQLite
					tournamentCtxTeam(5, {
						seed: null,
						startingBracketIdx: null,
						createdAt: 5,
					}),
					tournamentCtxTeam(1, { seed: 1, startingBracketIdx: 0 }),
					tournamentCtxTeam(2, { seed: 2, startingBracketIdx: 0 }),
					tournamentCtxTeam(3, { seed: 3, startingBracketIdx: 1 }),
					tournamentCtxTeam(4, { seed: 4, startingBracketIdx: 1 }),
				],
			},
		});

		const divATeamSeeds = [1, 2, 5].map(
			(teamId) => tournament.teamById(teamId)?.seed,
		);

		expect(new Set(divATeamSeeds).size).toBe(3);
	});
});

/** 4 teams, 5 rounds, advance threshold 3. Team 1 wins rounds 1-3 locking their spot, after which the pairing excludes them. */
function playOutEarlyAdvanceSwiss(
	progression: Progression.ParsedBracket[],
): BracketData {
	const data = Engine.create({
		type: "swiss",
		seeding: [1, 2, 3, 4],
		settings: { advanceThreshold: 3 },
	});
	const groupId = data.group[0].id;

	finishPendingMatches(data);
	for (let roundNumber = 2; roundNumber <= 5; roundNumber++) {
		const bracket = testTournament({
			data,
			ctx: { settings: { bracketProgression: progression } },
		}).bracketByIdx(0)!;
		const generated = Engine.generateRound(bracket.data, {
			groupId,
			standings: bracket.standings,
			settings: bracket.settings,
		});
		if (!generated.ok) break;
		appendGeneratedRound(data, unwrap(generated));
		finishPendingMatches(data);
	}

	return data;
}

/** Finishes every pending match, team 1 always winning theirs and otherwise the home side. */
function finishPendingMatches(data: BracketData) {
	for (const match of data.match) {
		if (match.winnerSide !== null || !match.opponent2) continue;

		match.winnerSide = match.opponent2.id === 1 ? "opponent2" : "opponent1";
	}
}

function appendGeneratedRound(data: BracketData, round: GeneratedRound) {
	let id = Math.max(...data.match.map((match) => match.id)) + 1;
	for (const match of round.matches) {
		data.match.push({
			id: id++,
			stageId: data.stage[0].id,
			groupId: round.groupId,
			roundId: round.roundId,
			number: match.number,
			opponent1: match.opponent1,
			opponent2: match.opponent2,
			winnerSide: null,
		});
	}
}
