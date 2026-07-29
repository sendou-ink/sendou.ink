import * as R from "remeda";
import type { TournamentSettings } from "~/db/tables-json";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
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

/** Every round of a bracket the factory starts is played on these. A bracket can
 * not be created without a map list, and picking one is the organizer's job. */
const ROUND_MAPS = {
	count: 3,
	type: "BEST_OF",
	list: ([1, 2, 3] as const).map((stageId) => ({
		mode: "SZ" as const,
		stageId,
	})),
} satisfies Omit<Engine.RoundMapsInput, "roundId">;

/** The wrapping calendar event is not the caller's to choose, so it is not an argument. */
type InsertArgs = Omit<
	Parameters<typeof CalendarRepository.insert>[0],
	"isFullTournament"
>;

type Options = {
	/** Mark the tournament finished without recording any results. For cases that
	 * only need the flag; a tournament with real results is finalized by
	 * `TournamentRepository.finalize` with a summary. */
	isFinalized?: boolean;
};

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
	applyOptions: async (tournament, { isFinalized }: Options) => {
		if (!isFinalized) return;

		await TournamentRepository.finalizeWithoutSummary(tournament.id);
	},
});

/**
 * Creates a tournament that has been played. Every entry of `teamRosters` registers
 * as a team owned by the first of its users and checks in, the first bracket is
 * started off that seeding, and every match of it is played out.
 *
 * Returns the teams and the matches played alongside the tournament, so that a
 * progression can carry on: start its next bracket and play that too.
 */
export async function createPlayed(
	overrides: Parameters<typeof create>[0],
	{ teamRosters, ...options }: Options & { teamRosters: number[][] },
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

	await startBracket(tournament.id);
	const matches = await playMatches(tournament.id);

	return { ...tournament, teams, matches };
}

// xxx: do we really want to chain different methods or just have some isFinalized in the create?
/**
 * Finalizes a fully played tournament with a real summary, the same way the
 * organizer's finalize button does: results on profiles, badges awarded to
 * `badgeReceivers`, skills and leaderboard entries.
 */
export async function finalize(
	tournamentId: number,
	{
		badgeReceivers,
	}: {
		badgeReceivers?: Parameters<typeof finalizeTournament>[0]["badgeReceivers"];
	} = {},
) {
	const tournament = await tournamentFromDB({ tournamentId, user: undefined });

	await finalizeTournament({ tournament, badgeReceivers });
}

/**
 * Starts one of the tournament's brackets, seeded by the teams that are in it —
 * the same teams the organizer would see offered on the bracket page.
 *
 * Later brackets of a progression are started by calling this again once the
 * matches they source their teams from have been played.
 *
 * Returns the matches the bracket was created with, in the generator's own order.
 */
export async function startBracket(
	tournamentId: number,
	{ bracketIdx = 0 }: { bracketIdx?: number } = {},
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
			maps: roundMapsFor(Engine.create(createInput), bracket.type),
		}),
	});

	clearTournamentDataCache(tournamentId);

	const started = await tournamentFromDB({ tournamentId, user: undefined });
	const startedBracket = started.bracketByIdx(bracketIdx);
	invariant(startedBracket, `Bracket at index ${bracketIdx} was not created`);

	return startedBracket.data.match.map((match) => ({ id: match.id }));
}

interface PlayedMatch {
	id: number;
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
 * call, so a caller can stop after any round.
 */
// xxx: later optional param to play all matches of the bracket out?
export async function playMatches(
	tournamentId: number,
): Promise<PlayedMatch[]> {
	const tournament = await tournamentFromDB({ tournamentId, user: undefined });

	const played = playableMatches(tournament);
	for (const match of played) {
		await setActiveRosters(tournamentId, match);
		await playOut(tournamentId, match);
	}

	clearTournamentDataCache(tournamentId);

	return played;
}

function roundMapsFor(
	bracket: Engine.BracketData,
	type: Engine.StageType,
): Engine.RoundMapsInput[] {
	// round robin and swiss share one map list per round number across their groups
	const rounds =
		type === "round_robin" || type === "swiss"
			? R.uniqueBy(bracket.round, (round) => round.number)
			: bracket.round;

	return rounds.map((round) => ({ roundId: round.id, ...ROUND_MAPS }));
}

function playableMatches(
	tournament: Awaited<ReturnType<typeof tournamentFromDB>>,
): PlayedMatch[] {
	return tournament.brackets
		.filter((bracket) => !bracket.preview)
		.flatMap((bracket) => {
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

async function playOut(tournamentId: number, match: PlayedMatch) {
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

async function findMatch(matchId: number) {
	const match = await TournamentMatchRepository.findMatchById(matchId);
	invariant(match, `Match ${matchId} not found`);

	return match;
}
