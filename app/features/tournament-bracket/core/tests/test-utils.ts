import * as R from "remeda";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
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
		abDivision: null,
		team: null,
		mapPool: [],
		members: [],
		activeRosterUserIds: [],
		avatarImgId: null,
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
	data?: BracketData;
	ctx?: Partial<TournamentData["ctx"]>;
}) => {
	const participant = R.pipe(
		data.match,
		R.flatMap((m) => [m.opponent1?.id, m.opponent2?.id]),
		R.filter(R.isTruthy),
		R.unique<number[]>,
	);

	const tournamentCtx: TournamentData["ctx"] = {
		eventId: 1,
		id: 1,
		tags: null,
		organization: null,
		tier: null,
		tentativeTier: null,
		parentTournamentId: null,
		parentTournamentName: null,
		hasRules: false,
		logoUrl: "/test.avif",
		discordUrl: null,
		startsAt: 1705858842,
		isFinalized: 0,
		name: "test",
		castTwitchAccounts: [],
		bracketProgressionOverrides: [],
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
		teams: nTeams(participant.length, Math.min(...participant)),
		author: {
			customUrl: null,
			customAvatarUrl: null,
			discordAvatar: null,
			discordId: "123",
			username: "test",
			pronouns: null,
			id: 1,
		},
		...ctx,
	};

	return new Tournament({
		// engine created data has no stage names, the database assigns them from the bracket progression
		data: {
			...data,
			stage: data.stage.map((stage, stageIdx) => ({
				...stage,
				name:
					stage.name ??
					tournamentCtx.settings.bracketProgression[stageIdx]?.name,
			})),
		},
		ctx: tournamentCtx,
	});
};

/**
 * Combines separately created brackets into the bracket data of one tournament,
 * offsetting the local ids of every bracket after the first the same way the
 * database does when a new stage is added to an existing tournament.
 */
export const mergeStages = (...brackets: BracketData[]): BracketData => {
	const merged: BracketData = { stage: [], group: [], round: [], match: [] };

	for (const bracket of brackets) {
		const offsets = {
			stage: merged.stage.length,
			group: merged.group.length,
			round: merged.round.length,
			match: merged.match.length,
		};

		merged.stage.push(
			...bracket.stage.map((stage) => ({
				...stage,
				id: stage.id + offsets.stage,
				number: offsets.stage + 1,
			})),
		);
		merged.group.push(
			...bracket.group.map((group) => ({
				...group,
				id: group.id + offsets.group,
				stageId: group.stageId + offsets.stage,
			})),
		);
		merged.round.push(
			...bracket.round.map((round) => ({
				...round,
				id: round.id + offsets.round,
				stageId: round.stageId + offsets.stage,
				groupId: round.groupId + offsets.group,
			})),
		);
		merged.match.push(
			...bracket.match.map((match) => ({
				...match,
				id: match.id + offsets.match,
				stageId: match.stageId + offsets.stage,
				groupId: match.groupId + offsets.group,
				roundId: match.roundId + offsets.round,
			})),
		);
	}

	return merged;
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
	singleEliminationWithUnderground: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
			name: "Underground",
			sources: [
				{
					bracketIdx: 0,
					placements: [-1],
				},
			],
		},
	],
	swissToTwoSingleEliminationsWithUnderground: [
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "swiss",
			settings: {
				groupCount: 1,
			},
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
			name: "Alpha",
			sources: [
				{
					bracketIdx: 0,
					placements: [1, 2, 3, 4, 5, 6, 7, 8],
				},
			],
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
			name: "Beta",
			sources: [
				{
					bracketIdx: 0,
					placements: [9, 10, 11, 12, 13, 14, 15, 16],
				},
			],
		},
		{
			...DEFAULT_PROGRESSION_ARGS,
			type: "single_elimination",
			name: "Alpha UG",
			sources: [
				{
					bracketIdx: 1,
					placements: [-1],
				},
			],
		},
	],
} satisfies Record<string, Progression.ParsedBracket[]>;
