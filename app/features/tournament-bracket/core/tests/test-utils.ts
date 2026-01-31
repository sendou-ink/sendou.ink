import * as R from "remeda";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
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
		seed: teamId + 1,
		...partial,
	};
};

const nTeams = (n: number, startingId: number) => {
	const teams = [];
	for (let i = 0; i < n; i++) {
		teams.push(tournamentCtxTeam(i + 1, tournamentCtxTeam(i + startingId)));
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
	const participant = R.pipe(
		data.match,
		R.flatMap((m) => [m.opponent1?.id, m.opponent2?.id]),
		R.filter(R.isTruthy),
		R.unique<number[]>,
	);

	return new Tournament({
		data,
		ctx: {
			eventId: 1,
			id: 1,
			tags: null,
			description: null,
			organization: null,
			tier: null,
			tentativeTier: null,
			parentTournamentId: null,
			rules: null,
			logoUrl: "/test.png",
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
			castStreams: [],
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
			seedingSnapshot: null,
			teams: nTeams(participant.length, Math.min(...participant)),
			author: {
				chatNameColor: null,
				customUrl: null,
				discordAvatar: null,
				discordId: "123",
				username: "test",
				pronouns: null,
				id: 1,
			},
			...ctx,
		},
	});
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
	swissEarlyAdvance: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "swiss",
			settings: {
				advanceThreshold: 3,
			},
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
			name: "B1",
			sources: [
				{
					bracketIdx: 0,
					placements: [],
				},
			],
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
