import { sql } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { TournamentSettings } from "~/db/tables-json";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as Standings from "~/features/tournament/core/Standings";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import * as Engine from "~/features/tournament-bracket/core/engine";
import { finalizeTournament } from "~/features/tournament-bracket/core/finalizeTournament.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { resolveMatchMapList } from "~/features/tournament-match/core/mapList.server";
import { reportScore } from "~/features/tournament-match/core/reportScore.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";
import { eventDefaults } from "./CalendarEventFactory";
import * as TournamentTeamFactory from "./TournamentTeamFactory";

const SINGLE_ELIMINATION: TournamentSettings["bracketProgression"] = [
	{
		name: "Bracket",
		type: "single_elimination",
		requiresCheckIn: false,
		settings: {
			thirdPlaceMatch: false,
		},
	},
];

/** Default maps of every round the factory starts; a bracket can't be created without a map list. */
const ROUND_MAPS = {
	count: 3,
	type: "BEST_OF",
	list: ([1, 2, 3] as const).map((stageId) => ({
		mode: "SZ" as const,
		stageId,
	})),
} satisfies RoundMaps;

/** The maps every round of a factory-started bracket is played on. */
export type RoundMaps = Omit<Engine.RoundMapsInput, "roundId">;

/** The wrapping calendar event is not the caller's to choose, so it is not an argument. */
type InsertArgs = Omit<
	Parameters<typeof CalendarRepository.insert>[0],
	"isFullTournament"
>;

type Options = {
	/** Confirmed tier, as starting the first bracket computes one. */
	tier?: TournamentTierNumber;
	/** Marks the tournament a league. Leagues have no creation UI, the flag is set straight in the db. */
	isLeague?: boolean;
};

/** Bracket idx(s) in the progression, or `"all"` = every bracket then finalize. */
type PlayedBrackets = number | number[] | "all";

/** Creates the wrapping `CalendarEvent` too and returns both ids. Single elimination unless `bracketProgression` says otherwise. */
export const { create } = defineFactory({
	defaults: () => ({
		...eventDefaults(),
		mapPickingStyle: "TO" as const,
		bracketProgression: SINGLE_ELIMINATION,
	}),
	insert: async (args: InsertArgs) => {
		const { eventId, tournamentId } = await CalendarRepository.insert({
			...args,
			isFullTournament: true,
		});

		invariant(tournamentId, "Expected the tournament to be created");

		return { id: tournamentId, eventId };
	},
	applyOptions: async (tournament, { tier, isLeague }: Options) => {
		if (isLeague) {
			await db
				.updateTable("Tournament")
				.set({
					settings: sql<string>`json_set(settings, '$.isLeague', json('true'))`,
				})
				.where("id", "=", tournament.id)
				.execute();
		}

		if (!tier) return;

		await TournamentRepository.upsertDivisionTier({
			tournamentId: tournament.id,
			bracketIdx: 0,
			tier,
		});
	},
});

/**
 * Each `teamRosters` entry registers (owned by its first user) and checks in; the brackets `playedOut`
 * names (default: the first) are played out off that seeding. Returns the teams and matches played.
 */
export async function createPlayed(
	overrides: Parameters<typeof create>[0],
	{
		teamRosters,
		playedOut = 0,
		maps,
		...options
	}: Options & {
		teamRosters: number[][];
		playedOut?: PlayedBrackets;
		maps?: RoundMaps;
	},
) {
	const tournament = await create(overrides, options);

	const teams: Awaited<ReturnType<typeof TournamentTeamFactory.create>>[] = [];
	for (const memberUserIds of teamRosters) {
		teams.push(
			await TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds },
				{ isCheckedIn: true },
			),
		);
	}

	const matches = await playOut(tournament.id, playedOut, { maps });

	return { ...tournament, teams, matches };
}

/**
 * Starts and plays every match of each bracket in order. `"all"` also finalizes like the organizer's
 * button does (results, badges, skills, leaderboard). Returns the matches in play order.
 */
export async function playOut(
	tournamentId: number,
	brackets: PlayedBrackets = 0,
	{ maps }: { maps?: RoundMaps } = {},
): Promise<PlayedMatch[]> {
	const tournament = await tournamentFromDB(tournamentId);
	const bracketIdxs =
		brackets === "all"
			? tournament.ctx.settings.bracketProgression.map((_, idx) => idx)
			: [brackets].flat();

	const matches: PlayedMatch[] = [];
	for (const bracketIdx of bracketIdxs) {
		await startBracket(tournamentId, { bracketIdx, maps });

		let progressed = true;
		while (progressed) {
			const playedThisPass = await playMatches(tournamentId);
			matches.push(...playedThisPass);

			progressed =
				playedThisPass.length > 0 ||
				(await generateNextSwissRound(tournamentId, bracketIdx));
		}
	}

	if (brackets === "all") {
		await finalize(tournamentId);
	}

	return matches;
}

/**
 * Starts a bracket seeded by the teams in it, every round on `maps` (default SZ Bo3). Later brackets
 * are started by calling again once their source matches are played. Returns the matches created.
 */
export async function startBracket(
	tournamentId: number,
	{
		bracketIdx = 0,
		maps = ROUND_MAPS,
	}: { bracketIdx?: number; maps?: RoundMaps } = {},
) {
	const tournament = await tournamentFromDB(tournamentId);

	const bracket = tournament.bracketByIdx(bracketIdx);
	invariant(bracket, `Tournament has no bracket at index ${bracketIdx}`);

	const seeding = bracket.seeding;
	invariant(seeding?.length, `Bracket at index ${bracketIdx} has no teams`);

	const createInput: Engine.CreateBracketInput = {
		type: bracket.type,
		seeding,
		settings: bracket.settings,
	};

	await BracketRepository.insertBracket({
		tournamentId,
		name: bracket.name,
		bracket: Engine.create({
			...createInput,
			maps: roundMapsFor(Engine.create(createInput), bracket.type, maps),
		}),
		isLeague: tournament.isLeague,
	});

	await persistSeeds(tournament);

	clearTournamentDataCache(tournamentId);

	const started = await tournamentFromDB(tournamentId);
	const startedBracket = started.bracketByIdx(bracketIdx);
	invariant(startedBracket, `Bracket at index ${bracketIdx} was not created`);

	return startedBracket.data.match.map((match) => ({ id: match.id }));
}

/** Marks a match casted by a Twitch account, adding the account to the cast accounts first like the stream page does. */
export async function castMatch({
	tournamentId,
	matchId,
	twitchAccount,
}: {
	tournamentId: number;
	matchId: number;
	twitchAccount: string;
}) {
	const tournament = await TournamentRepository.findById(tournamentId);
	invariant(tournament, `Tournament ${tournamentId} not found`);

	await TournamentRepository.updateCastTwitchAccounts({
		tournamentId,
		castTwitchAccounts: [
			...(tournament.castTwitchAccounts ?? []),
			twitchAccount,
		],
	});
	await TournamentRepository.setMatchAsCasted({
		tournamentId,
		matchId,
		twitchAccount,
	});

	clearTournamentDataCache(tournamentId);
}

interface PlayedMatch {
	id: number;
	/** Index of the bracket the match belongs to in the progression. */
	bracketIdx: number;
	/** Number of the bracket group the match belongs to, e.g. its round robin pool. */
	groupNumber: number;
	winnerTeamId: number;
	loserTeamId: number;
}

/**
 * Plays every match with both teams known, the higher seed winning each map through `reportScore` like
 * the match page. One pass only: matches these advance teams into are left for the next call.
 */
export async function playMatches(
	tournamentId: number,
): Promise<PlayedMatch[]> {
	const tournament = await tournamentFromDB(tournamentId);

	const played = playableMatches(tournament);
	for (const match of played) {
		await setActiveRosters(tournamentId, match);
		await playOutMatch(tournamentId, match);
	}

	clearTournamentDataCache(tournamentId);

	return played;
}

/** Next swiss round per group, like the organizer's advance button. Returns whether a round was left to generate. */
async function generateNextSwissRound(
	tournamentId: number,
	bracketIdx: number,
) {
	const tournament = await tournamentFromDB(tournamentId);

	const bracket = tournament.bracketByIdx(bracketIdx);
	if (bracket?.type !== "swiss" || bracket.preview) return false;

	let generated = false;
	for (const group of bracket.data.group) {
		const groupsMatches = bracket.data.match.filter(
			(match) => match.groupId === group.id,
		);
		const generatedRoundCount = new Set(
			groupsMatches.map((match) => match.roundId),
		).size;
		if (generatedRoundCount >= bracket.swissRoundCount) continue;

		const round = Engine.generateRound(bracket.data, {
			groupId: group.id,
			standings: bracket.standings,
			settings: bracket.settings,
		});
		if (!round.ok) continue;

		const stageId = groupsMatches[0]?.stageId;
		invariant(stageId, `Swiss group ${group.id} has no matches`);

		await BracketRepository.insertRoundMatches({
			stageId,
			round: round.value,
			isLeague: tournament.isLeague,
		});
		generated = true;
	}

	if (generated) {
		clearTournamentDataCache(tournamentId);
	}

	return generated;
}

/** Without persisted seeds the shown ones are recomputed from seeding skills and drift from the started bracket. */
async function persistSeeds(
	tournament: Awaited<ReturnType<typeof tournamentFromDB>>,
) {
	const isAllSeedsPersisted = tournament.ctx.teams.every(
		(team) => typeof team.seed === "number",
	);
	if (isAllSeedsPersisted) return;

	await TournamentRepository.updateTeamSeeds({
		tournamentId: tournament.ctx.id,
		teamIds: tournament.ctx.teams.map((team) => team.id),
	});
}

function roundMapsFor(
	bracket: Engine.BracketData,
	type: Engine.StageType,
	maps: RoundMaps,
): Engine.RoundMapsInput[] {
	// round robin and swiss share one map list per round number across their groups
	const rounds =
		type === "round_robin" || type === "swiss"
			? R.uniqueBy(bracket.round, (round) => round.number)
			: bracket.round;

	return rounds.map((round) => ({ roundId: round.id, ...maps }));
}

function playableMatches(
	tournament: Awaited<ReturnType<typeof tournamentFromDB>>,
): PlayedMatch[] {
	return tournament.brackets.flatMap((bracket, bracketIdx) => {
		if (bracket.preview) return [];

		const groupNumbers = new Map(
			bracket.data.group.map((group) => [group.id, group.number]),
		);

		return bracket.data.match
			.filter((match) => bracket.matchStatus(match.id) === "STARTED")
			.flatMap((match) =>
				match.opponent1?.id && match.opponent2?.id
					? [
							{
								id: match.id,
								bracketIdx,
								groupNumber: groupNumbers.get(match.groupId)!,
								winnerTeamId: match.opponent1.id,
								loserTeamId: match.opponent2.id,
							},
						]
					: [],
			);
	});
}

async function setActiveRosters(tournamentId: number, match: PlayedMatch) {
	const tournament = await tournamentFromDB(tournamentId);

	for (const teamId of [match.winnerTeamId, match.loserTeamId]) {
		const team = tournament.teamById(teamId);
		invariant(team, `Team ${teamId} is not in the tournament`);
		invariant(
			team.memberUserIds.length >= tournament.minMembersPerTeam,
			`Team ${teamId} has too few members to play a match`,
		);

		// a team without subs plays with everybody it has, so it is never asked
		if (team.memberUserIds.length === tournament.minMembersPerTeam) continue;

		await TournamentTeamRepository.setActiveRoster({
			teamId,
			activeRosterUserIds: team.memberUserIds.slice(
				0,
				tournament.minMembersPerTeam,
			),
		});
	}
}

async function playOutMatch(tournamentId: number, match: PlayedMatch) {
	let position = 0;
	let setOver = false;

	while (!setOver) {
		// rehydrated per map, the previous report having moved the score on
		const tournament = await tournamentFromDB(tournamentId);
		const matchRow = await findMatch(match.id);

		const reported = await reportScore({
			match: matchRow,
			tournament,
			mapList: await resolveMatchMapList({ match: matchRow, tournament }),
			user: { id: tournament.ctx.author.id },
			position,
			winnerTeamId: match.winnerTeamId,
			// brackets that count knockouts refuse a report without one
			ko: false,
		});
		invariant(
			reported,
			`Map ${position} of match ${match.id} was already reported`,
		);

		setOver = reported.setOver;
		position++;
	}
}

async function finalize(tournamentId: number) {
	const tournament = await tournamentFromDB(tournamentId);

	const event = await CalendarRepository.findById(tournament.ctx.eventId, {
		includeBadgePrizes: true,
		includeTrophy: true,
	});
	const winner = winningTeam(tournament);

	await finalizeTournament({
		tournament,
		badgeReceivers: event?.badgePrizes?.length
			? event.badgePrizes.map((badge) => ({
					badgeId: badge.id,
					tournamentTeamId: winner.team.id,
					userIds: winner.team.memberUserIds,
				}))
			: undefined,
		trophyReceiver: event?.trophy
			? {
					trophyId: event.trophy.id,
					userIds: winner.team.memberUserIds,
				}
			: undefined,
	});
}

/** Who the organizer typically assigns the prizes to. */
function winningTeam(tournament: Awaited<ReturnType<typeof tournamentFromDB>>) {
	const winner = Standings.flattenStandings(
		Standings.tournamentStandings(tournament),
	).find((standing) => standing.placement === 1);
	invariant(winner, "Tournament to award prizes for has no winner");

	return winner;
}

async function findMatch(matchId: number) {
	const match = await TournamentMatchRepository.findMatchById(matchId);
	invariant(match, `Match ${matchId} not found`);

	return match;
}
