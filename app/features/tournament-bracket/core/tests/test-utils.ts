import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import { removeDuplicates } from "~/utils/arrays";
import type * as Progression from "../Progression";
import { Tournament } from "../Tournament";
import type { TournamentData } from "../Tournament.server";

export const tournamentCtxTeam = (
	teamId: number,
	partial?: Partial<TournamentData["ctx"]["teams"][0]>,
): TournamentData["ctx"]["teams"][0] => {
	return {
		checkIns: [{ checkedInAt: 1705858841, bracketIdx: null, isCheckOut: 0 }],
		createdAt: 0,
		id: teamId,
		inviteCode: null,
		avgSeedingSkillOrdinal: null,
		startingBracketIdx: null,
		team: null,
		mapPool: [],
		members: [],
		activeRosterUserIds: [],
		pickupAvatarUrl: null,
		name: `Team ${teamId}`,
		prefersNotToHost: 0,
		droppedOut: 0,
		noScreen: 0,
		seed: teamId + 1,
		...partial,
	};
};

const nTeams = (n: number, startingId: number) => {
	const teams = [];
	for (let i = 0; i < n; i++) {
		teams.push(tournamentCtxTeam(i, tournamentCtxTeam(i + startingId)));
	}
	return teams;
};

export const testTournament = ({
	data = {
		match: [],
		group: [],
		round: [],
		stage: [],
	},
	ctx,
}: {
	data?: TournamentManagerDataSet;
	ctx?: Partial<TournamentData["ctx"]>;
}) => {
	const participant = removeDuplicates(
		data.match
			.flatMap((m) => [m.opponent1?.id, m.opponent2?.id])
			.filter(Boolean),
	) as number[];

	return new Tournament({
		data,
		ctx: {
			eventId: 1,
			id: 1,
			tags: null,
			description: null,
			organization: null,
			parentTournamentId: null,
			rules: null,
			logoUrl: null,
			logoSrc: "/test.png",
			logoValidatedAt: null,
			discordUrl: null,
			startTime: 1705858842,
			isFinalized: 0,
			name: "test",
			castTwitchAccounts: [],
			bracketProgressionOverrides: [],
			subCounts: [],
			staff: [],
			tieBreakerMapPool: [],
			toSetMapPool: [],
			participatedUsers: [],
			mapPickingStyle: "AUTO_SZ",
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
			castedMatchesInfo: null,
			teams: nTeams(participant.length, Math.min(...participant)),
			author: {
				chatNameColor: null,
				customUrl: null,
				discordAvatar: null,
				discordId: "123",
				username: "test",
				id: 1,
			},
			...ctx,
		},
	});
};

export const adjustResults = (
	data: TournamentManagerDataSet,
	adjustedArr: Array<{
		ids: [number, number];
		score: [number, number];
		points?: [number, number];
	}>,
): TournamentManagerDataSet => {
	return {
		...data,
		match: data.match.map((match, idx) => {
			const adjusted = adjustedArr[idx];
			if (!adjusted) throw new Error(`No adjusted result for match ${idx}`);

			if (adjusted.ids[0] !== match.opponent1!.id) {
				throw new Error("Adjusted match opponent1 id does not match");
			}

			if (adjusted.ids[1] !== match.opponent2!.id) {
				throw new Error("Adjusted match opponent2 id does not match");
			}

			return {
				...match,
				opponent1: {
					...match.opponent1!,
					score: adjusted.score[0],
					result: adjusted.score[0] > adjusted.score[1] ? "win" : "loss",
					totalPoints: adjusted.points
						? adjusted.points[0]
						: adjusted.score[0] > adjusted.score[1]
							? 100
							: 0,
				},
				opponent2: {
					...match.opponent2!,
					score: adjusted.score[1],
					result: adjusted.score[1] > adjusted.score[0] ? "win" : "loss",
					totalPoints: adjusted.points
						? adjusted.points[1]
						: adjusted.score[1] > adjusted.score[0]
							? 100
							: 0,
				},
			};
		}),
	};
};

const DEFAULT_PROGRESSION_ARGS = {
	requiresCheckIn: false,
	settings: {},
	name: "Main Bracket",
};

export const progressions = {
	singleElimination: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
		},
	],
	roundRobinToSingleElimination: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "round_robin",
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
			name: "B1",
			sources: [
				{
					bracketIdx: 0,
					placements: [1, 2],
				},
			],
		},
	],
	lowInk: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "swiss",
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			name: "B1",
			type: "double_elimination",
			sources: [
				{
					bracketIdx: 0,
					placements: [3, 4],
				},
			],
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			name: "B2",
			type: "round_robin",
			sources: [
				{
					bracketIdx: 0,
					placements: [1, 2],
				},
			],
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			name: "B3",
			type: "double_elimination",
			sources: [
				{
					bracketIdx: 2,
					placements: [1, 2],
				},
			],
		},
	],
	manyStartBrackets: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "round_robin",
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "round_robin",
			name: "B1",
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
			name: "B2",
			sources: [
				{
					bracketIdx: 0,
					placements: [1, 2],
				},
			],
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
			name: "B3",
			sources: [
				{
					bracketIdx: 1,
					placements: [1, 2],
				},
			],
		},
	],
	swissOneGroup: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "swiss",
			settings: {
				groupCount: 1,
			},
		},
	],
	doubleEliminationWithUnderground: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "double_elimination",
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "double_elimination",
			name: "Underground",
			sources: [
				{
					bracketIdx: 0,
					placements: [-1, -2],
				},
			],
		},
	],
} satisfies Record<string, Progression.ParsedBracket[]>;
