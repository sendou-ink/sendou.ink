import * as R from "remeda";
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

/** Every round of a bracket the factory starts is played on these, unless the
 * caller passes a `maps` option. A bracket can not be created without a map list,
 * and picking one is the organizer's job. */
const ROUND_MAPS = {
	count: 3,
	type: "BEST_OF",
	list: ([1, 2, 3] as const).map((stageId) => ({
		mode: "SZ" as const,
		stageId,
	})),
} satisfies RoundMaps;

/** The maps every round of a factory-started bracket is played on. */
type RoundMaps = Omit<Engine.RoundMapsInput, "roundId">;

/** The wrapping calendar event is not the caller's to choose, so it is not an argument. */
type InsertArgs = Omit<
	Parameters<typeof CalendarRepository.insert>[0],
	"isFullTournament"
>;

type Options = {
	/** Confirmed tier, as starting the first bracket computes one. */
	tier?: TournamentTierNumber;
};

/** Brackets to play out fully: one by its idx in the progression, several, or
 * `"all"` for every bracket followed by finalizing the tournament. */
type PlayedBrackets = number | number[] | "all";

/**
 * Creates tournaments. Aggregate factory: the `CalendarEvent` wrapping the
 * tournament and its start date are created with it, because there is no such thing
 * as a tournament without one. Returns both ids.
 *
 * The bracket is a single elimination one unless `bracketProgression` says otherwise.
 */
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
	applyOptions: async (tournament, { tier }: Options) => {
		if (!tier) return;

		await TournamentRepository.updateTournamentTier({
			tournamentId: tournament.id,
			tier,
		});
	},
});

/**
 * Creates a tournament that has been played. Every entry of `teamRosters` registers
 * as a team owned by the first of its users and checks in, and the brackets
 * `playedOut` names are played out off that seeding — the first bracket when not
 * given, `"all"` for the whole tournament played and finalized.
 *
 * Returns the teams and the matches played alongside the tournament, so that a
 * test can carry on from wherever `playedOut` left the tournament.
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
 * Plays brackets out fully, in the order given: each is started and every match of
 * it played. `"all"` plays every bracket of the progression and then finalizes the
 * tournament the same way the organizer's finalize button does: results on
 * profiles, the tournament's badges awarded to its winning team, skills and
 * leaderboard entries.
 *
 * Returns the matches played, in play order.
 */
export async function playOut(
	tournamentId: number,
	brackets: PlayedBrackets = 0,
	{ maps }: { maps?: RoundMaps } = {},
): Promise<PlayedMatch[]> {
	const tournament = await tournamentFromDB({ tournamentId, user: undefined });
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
 * Starts one of the tournament's brackets, seeded by the teams that are in it —
 * the same teams the organizer would see offered on the bracket page. Every round
 * is played on `maps`, or the factory's default SZ Bo3 list.
 *
 * Later brackets of a progression are started by calling this again once the
 * matches they source their teams from have been played.
 *
 * Returns the matches the bracket was created with, in the generator's own order.
 */
export async function startBracket(
	tournamentId: number,
	{
		bracketIdx = 0,
		maps = ROUND_MAPS,
	}: { bracketIdx?: number; maps?: RoundMaps } = {},
) {
	const tournament = await tournamentFromDB({ tournamentId, user: undefined });

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
	});

	await persistSeeds(tournament);

	clearTournamentDataCache(tournamentId);

	const started = await tournamentFromDB({ tournamentId, user: undefined });
	const startedBracket = started.bracketByIdx(bracketIdx);
	invariant(startedBracket, `Bracket at index ${bracketIdx} was not created`);

	return startedBracket.data.match.map((match) => ({ id: match.id }));
}

/**
 * Marks a match as casted by a Twitch account, adding the account to the
 * tournament's cast accounts first, the way the organizer's stream page does.
 */
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
 * Plays out every match both of whose teams are known, the higher seeded team
 * winning each map of it. Every map goes through `reportScore`, the same function
 * the match page reports through, so the bracket, the standings and the
 * participation rows end up exactly as they do when the teams play it.
 *
 * One pass only: matches the played ones advance teams into are left for the next
 * call, so a caller can stop after any round. `playOut` plays to the end.
 */
export async function playMatches(
	tournamentId: number,
): Promise<PlayedMatch[]> {
	const tournament = await tournamentFromDB({ tournamentId, user: undefined });

	const played = playableMatches(tournament);
	for (const match of played) {
		await setActiveRosters(tournamentId, match);
		await playOutMatch(tournamentId, match);
	}

	clearTournamentDataCache(tournamentId);

	return played;
}

/**
 * Generates the matches of a swiss bracket's next round, each of its groups the
 * same way the organizer's advance button does. Swiss pairs a round off the
 * standings of the one before it, so the matches of a round only exist once the
 * previous round has been played.
 *
 * Returns whether there was a round left to generate.
 */
async function generateNextSwissRound(
	tournamentId: number,
	bracketIdx: number,
) {
	const tournament = await tournamentFromDB({ tournamentId, user: undefined });

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
		if (round.isErr()) continue;

		const stageId = groupsMatches[0]?.stageId;
		invariant(stageId, `Swiss group ${group.id} has no matches`);

		await BracketRepository.insertRoundMatches({
			stageId,
			round: round.value,
		});
		generated = true;
	}

	if (generated) {
		clearTournamentDataCache(tournamentId);
	}

	return generated;
}

/** Writes the seeds the bracket was created off, the same way starting a bracket
 * through the site does. Without them the seeds shown are recomputed from the teams'
 * seeding skills every time, so they drift out of sync with the started bracket as
 * soon as those change. */
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
		teamsWithMembers: tournament.ctx.teams.map((team) => ({
			teamId: team.id,
			members: team.members.map((member) => ({
				userId: member.userId,
				username: member.username,
			})),
		})),
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
	const tournament = await tournamentFromDB({ tournamentId, user: undefined });

	for (const teamId of [match.winnerTeamId, match.loserTeamId]) {
		const team = tournament.teamById(teamId);
		invariant(team, `Team ${teamId} is not in the tournament`);
		invariant(
			team.members.length >= tournament.minMembersPerTeam,
			`Team ${teamId} has too few members to play a match`,
		);

		// a team without subs plays with everybody it has, so it is never asked
		if (team.members.length === tournament.minMembersPerTeam) continue;

		await TournamentTeamRepository.setActiveRoster({
			teamId,
			activeRosterUserIds: team.members
				.slice(0, tournament.minMembersPerTeam)
				.map((member) => member.userId),
		});
	}
}

async function playOutMatch(tournamentId: number, match: PlayedMatch) {
	let position = 0;
	let setOver = false;

	while (!setOver) {
		// rehydrated per map, the previous report having moved the score on
		const tournament = await tournamentFromDB({
			tournamentId,
			user: undefined,
		});
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
	const tournament = await tournamentFromDB({ tournamentId, user: undefined });

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
					userIds: winner.team.members.map((member) => member.userId),
				}))
			: undefined,
		trophyReceiver: event?.trophy
			? {
					trophyId: event.trophy.id,
					userIds: winner.team.members.map((member) => member.userId),
				}
			: undefined,
	});
}

/** Whose the tournament's prizes are, as the organizer typically assigns them. */
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
