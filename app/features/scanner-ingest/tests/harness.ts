/**
 * Everything the ingest scenario cases need: world builders (arrange), the
 * ingest wrapper (act), page-loader wrappers and row fetchers (assert).
 * Cases import only from here, plus vitest. See README.md for the design.
 */
import { addHours, addMinutes, subDays, subMinutes } from "date-fns";
import * as R from "remeda";
import { afterAll, beforeAll } from "vitest";
import { Config } from "~/config";
import { backdate } from "~/db/seed/core/backdate";
import * as SQMatchFactory from "~/db/seed/factories/SQMatchFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { ScannerMatch } from "~/features/scanner/core/scanner-match";
import {
	loader as qMatchLoader,
	type SendouQMatchLoaderData,
} from "~/features/sendouq-match/loaders/q.match.$id.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { clearAllTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import {
	type TournamentMatchLoaderData,
	loader as tournamentMatchLoader,
} from "~/features/tournament-match/loaders/to.$id.matches.$mid.server";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { wrappedAction, wrappedLoader } from "~/utils/Test";
import { action } from "../actions/scanner-ingest.server";
import type {
	IngestResponse,
	ingestBodySchema,
} from "../scanner-ingest-schemas";

/** In-game names of the SendouQ world's alpha group, in member order. */
export const ALPHA_NAMES = ["Alpha1", "Alpha2", "Alpha3", "Alpha4"];
/** In-game names of the SendouQ world's bravo group, in member order. */
export const BRAVO_NAMES = ["Bravo1", "Bravo2", "Bravo3", "Bravo4"];
/** Weapons `scanned()` reads, winner rows first — row 0 is the default POV seat. */
export const WEAPONS: MainWeaponId[] = [10, 20, 30, 40, 50, 60, 70, 80];
/** One weapon per tournament-world player, so no two rosters read alike. */
const TOURNAMENT_WEAPONS: MainWeaponId[] = [
	10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 0, 1, 11, 21, 22, 31,
];

const DISCRIMINATOR = "1111";
const PLAYERS_PER_TEAM = 4;
/** minutes between consecutive tournament sets' backdated timestamps */
const SET_STAGGER_MINUTES = 10;
/** minutes between a SendouQ set's consecutive map reports */
const MAP_REPORT_STAGGER_MINUTES = 5;

/** A game a `scanned()` read can be derived from, so rosters/mode/stage line up. */
export interface ScannableGame {
	mode: ModeShort;
	stage: StageId;
	/** chronological position among the world's games, spacing reads apart */
	order: number;
	/**
	 * wall-clock ms the game was reported, for cases whose read has to sit on
	 * the world's real timeline rather than the default "now + order" spacing
	 */
	playedAt?: number;
	winnerNames: string[];
	loserNames: string[];
	/**
	 * each player's weapon, keyed by name. Worlds keep this stable per player
	 * so two games between different opponents never read as the same match.
	 * Reads fall back to `WEAPONS` by row for games built outside a world.
	 */
	weaponFor?: (name: string) => MainWeaponId;
}

export interface ScannedOptions extends Partial<ScannerMatch> {
	/** `"loser"` flips the teams array so the read is winner-last (`winner: 1`). */
	seenFrom?: "winner" | "loser";
	/** spectator footage: no POV seat */
	cast?: boolean;
	/** minimap-only read: empty rosters, winner/mode/scores unread */
	partial?: boolean;
}

/**
 * Forces the scanner gate open for the whole suite (fallback for
 * `import.meta.env` not carrying the config's `test.env`), restoring the
 * original value afterwards. Call at the top of the test file.
 */
export function setupScannerGate() {
	let original: boolean;
	beforeAll(() => {
		original = Config.scannerEnabled;
		Config.scannerEnabled = true;
	});
	afterAll(() => {
		Config.scannerEnabled = original;
	});
}

/** Runs `fn` with the scanner gate closed, restoring it even on a throw. */
export async function withScannerDisabled(fn: () => Promise<void>) {
	const original = Config.scannerEnabled;
	Config.scannerEnabled = false;
	try {
		await fn();
	} finally {
		Config.scannerEnabled = original;
	}
}

/**
 * 8 users with deterministic in-game names (`Alpha1#1111`, …) and a SendouQ
 * match between them. The match starts unreported; `conclude()` plays it out
 * the way the teams report it (alpha sweeps), making its maps linkable, and
 * returns the refreshed map rows.
 */
export async function sendouqWorld(
	options: {
		createdAt?: Date;
		/** the set's maps, when a case needs a specific one (e.g. the same map twice) */
		mapList?: Array<{ mode: ModeShort; stageId: StageId }>;
	} = {},
) {
	const users = await createNamedUsers([...ALPHA_NAMES, ...BRAVO_NAMES]);
	const alphaUsers = users.slice(0, PLAYERS_PER_TEAM);
	const bravoUsers = users.slice(PLAYERS_PER_TEAM);

	const match = await SQMatchFactory.create(
		{
			alphaUserIds: alphaUsers.map((user) => user.id),
			bravoUserIds: bravoUsers.map((user) => user.id),
			...(options.mapList
				? {
						mapList: options.mapList.map((map) => ({
							...map,
							source: "BOTH" as const,
						})),
					}
				: null),
		},
		options.createdAt ? { createdAt: options.createdAt } : undefined,
	);
	const maps = await groupMatchMaps(match.id);

	return {
		match,
		maps,
		alphaUsers,
		bravoUsers,
		povUser: alphaUsers[0]!,
		conclude: async (reportedThrough?: Date) => {
			await concludeGroupMatch(match.id);
			await stampMapReports(match.id, reportedThrough ?? new Date());
			return groupMatchMaps(match.id);
		},
		scanned: (
			map: { mode: ModeShort; stageId: StageId; index: number },
			options?: ScannedOptions,
		) =>
			scannedGame(
				{
					mode: map.mode,
					stage: map.stageId,
					order: map.index,
					winnerNames: ALPHA_NAMES,
					loserNames: BRAVO_NAMES,
				},
				options,
			),
	};
}

/**
 * A played single-elimination tournament: `teams` rosters of 4 users, all
 * with deterministic in-game names (`T1P1#1111`, …), played out through
 * `playedOut` the way `TournamentFactory.createPlayed` plays brackets.
 * Match/game timestamps are staggered into the recent past in play order, so
 * activity resolution and chronological walks see an unambiguous timeline.
 * Creating a world clears the tournament data caches: SQLite ids restart
 * after the db wipe, so a previous test's entries could otherwise serve
 * stale data for a reused id.
 */
export async function tournamentWorld(
	options: { teams?: number; playedOut?: number } = {},
) {
	clearAllTournamentDataCache();

	const teamCount = options.teams ?? 4;
	const author = await UserFactory.create();
	const names = R.range(0, teamCount).flatMap((teamIdx) =>
		R.range(0, PLAYERS_PER_TEAM).map(
			(playerIdx) => `T${teamIdx + 1}P${playerIdx + 1}`,
		),
	);
	const users = await createNamedUsers(names);
	const teamRosters = R.chunk(users, PLAYERS_PER_TEAM).map((roster) =>
		roster.map((user) => user.id),
	);

	const tournament = await TournamentFactory.createPlayed(
		{ authorId: author.id },
		{ teamRosters, playedOut: options.playedOut ?? 0 },
	);
	const startedAtByMatchId = await staggerTournamentTimeline(
		tournament.matches,
	);
	clearAllTournamentDataCache();

	const nameByUserId = new Map(
		users.map((user, index) => [user.id, names[index]!]),
	);
	const namesByTeamId = new Map(
		tournament.teams.map((team) => [
			team.id,
			team.memberUserIds.map((userId) => nameByUserId.get(userId)!),
		]),
	);
	const matches = tournament.matches;
	const championTeamId = matches.at(-1)!.winnerTeamId;
	const championTeam = tournament.teams.find(
		(team) => team.id === championTeamId,
	)!;

	return {
		tournamentId: tournament.id,
		teams: tournament.teams,
		matches,
		author,
		championTeamId,
		povUser: users.find((user) => user.id === championTeam.memberUserIds[0])!,
		matchesOfTeam: (teamId: number) =>
			matches.filter(
				(match) =>
					match.winnerTeamId === teamId || match.loserTeamId === teamId,
			),
		/** wall-clock ms the set's backdated `startedAt` sits at. */
		startedAtOf: (matchId: number) => {
			const startedAt = startedAtByMatchId.get(matchId);
			invariant(startedAt, `Match ${matchId} is not part of the world`);
			return startedAt.getTime();
		},
		games: async (matchId: number): Promise<ScannableGame[]> => {
			const played = matches.find((match) => match.id === matchId);
			invariant(played, `Match ${matchId} is not part of the world`);
			const matchIdx = matches.indexOf(played);

			const rows = await db
				.selectFrom("TournamentMatchGameResult")
				.select(["number", "mode", "stageId", "winnerTeamId", "createdAt"])
				.where("matchId", "=", matchId)
				.orderBy("number", "asc")
				.execute();

			return rows.map((row) => ({
				mode: row.mode,
				stage: row.stageId,
				order: matchIdx * SET_STAGGER_MINUTES + row.number,
				playedAt: databaseTimestampToJavascriptTimestamp(row.createdAt),
				winnerNames: namesByTeamId.get(row.winnerTeamId)!,
				loserNames: namesByTeamId.get(
					row.winnerTeamId === played.winnerTeamId
						? played.loserTeamId
						: played.winnerTeamId,
				)!,
				weaponFor: (name: string) => TOURNAMENT_WEAPONS[names.indexOf(name)]!,
			}));
		},
		scanned: scannedGame,
		cast: (matchId: number) =>
			TournamentFactory.castMatch({
				tournamentId: tournament.id,
				matchId,
				twitchAccount: "testcaster",
			}),
		staff: (user: { id: number }) =>
			TournamentRepository.setStaff({
				tournamentId: tournament.id,
				staff: [{ userId: user.id, role: "STREAMER" }],
			}),
	};
}

/**
 * Another SendouQ match between a world's same players, made at `createdAt` —
 * the later queueing an earlier match's read must not be captured by.
 */
export function anotherSendouqMatch(
	world: {
		alphaUsers: Array<{ id: number }>;
		bravoUsers: Array<{ id: number }>;
	},
	createdAt: Date,
) {
	return SQMatchFactory.create(
		{
			alphaUserIds: world.alphaUsers.map((user) => user.id),
			bravoUserIds: world.bravoUsers.map((user) => user.id),
		},
		{ createdAt },
	);
}

/** A user outside any world, optionally with an in-game name set. */
export function createUser(inGameName?: string) {
	return UserFactory.create({
		profile: inGameName ? { inGameName } : null,
	});
}

/**
 * Derives a full `ScannerMatch` from a sendou.ink game so mode/stage/rosters
 * line up by construction; options spell out a case's deviation. The default
 * read is winner-first with the POV on seat 0 of the winning team, played
 * when the game says it was — or, for games that carry no time of their own,
 * "now" offset by `order` so multi-read requests stay chronological.
 */
export function scannedGame(
	game: ScannableGame,
	options: ScannedOptions = {},
): ScannerMatch {
	const {
		seenFrom = "winner",
		cast = false,
		partial = false,
		...overrides
	} = options;

	const winners = scannedTeam(game.winnerNames, 0, game.weaponFor);
	const losers = scannedTeam(game.loserNames, PLAYERS_PER_TEAM, game.weaponFor);
	const startsAt = 60 + game.order * 360;

	const base: ScannerMatch = {
		startsAt,
		endsAt: startsAt + 300,
		playedAt: game.playedAt ?? Date.now() + game.order * 60_000,
		lobby: "PRIVATE",
		mode: game.mode,
		stage: game.stage,
		matchScores: seenFrom === "loser" ? [48, 100] : [100, 48],
		replayCode: null,
		cast,
		objective: null,
		playerStatus: null,
		teams: seenFrom === "loser" ? [losers, winners] : [winners, losers],
		winner: seenFrom === "loser" ? 1 : 0,
		pov: cast ? null : { team: 0, index: 0 },
	};

	if (partial) {
		return {
			...base,
			mode: null,
			matchScores: null,
			teams: [{ players: [] }, { players: [] }],
			winner: null,
			pov: null,
			...overrides,
		};
	}

	return { ...base, ...overrides };
}

/** A copy of the match with every read player name passed through `rename`. */
export function renamed(
	match: ScannerMatch,
	rename: (name: string, rowIndex: number) => string,
): ScannerMatch {
	return {
		...match,
		teams: [renamedTeam(match, 0, rename), renamedTeam(match, 1, rename)],
	};
}

const ingestAction = wrappedAction<typeof ingestBodySchema>({
	action,
	isJsonSubmission: true,
});

/** Sends matches through the real ingest action, authenticated as `user`. */
export function ingest(
	user: { id: number },
	matches: ScannerMatch[],
): Promise<IngestResponse> {
	return ingestAction({ matches }, { user: user.id });
}

const qMatchLoaderWrapped = wrappedLoader<SendouQMatchLoaderData>({
	loader: qMatchLoader,
});
const tournamentMatchLoaderWrapped = wrappedLoader<TournamentMatchLoaderData>({
	loader: tournamentMatchLoader,
});

/** The real `/q/match/:id` loader's data, as an anonymous visitor sees it. */
export function qMatchPage(matchId: number) {
	return qMatchLoaderWrapped({ params: { id: String(matchId) } });
}

/** The real `/to/:id/matches/:mid` loader's data, as an anonymous visitor sees it. */
export function tournamentMatchPage(tournamentId: number, matchId: number) {
	return tournamentMatchLoaderWrapped({
		params: { id: String(tournamentId), mid: String(matchId) },
	});
}

export function fetchIngestedMatches() {
	return db
		.selectFrom("IngestedMatch")
		.selectAll()
		.orderBy("id", "asc")
		.execute();
}

export function fetchLinks() {
	return db
		.selectFrom("IngestedMatchLink")
		.selectAll()
		.orderBy("id", "asc")
		.execute();
}

export function fetchReportedWeapons() {
	return db.selectFrom("ReportedWeapon").selectAll().execute();
}

export function daysAgo(days: number) {
	return subDays(new Date(), days);
}

export function minutesAgo(minutes: number) {
	return subMinutes(new Date(), minutes);
}

export function hoursLater(date: Date, hours: number) {
	return addHours(date, hours);
}

async function createNamedUsers(names: string[]) {
	const users: Array<{ id: number }> = [];
	for (const name of names) {
		users.push(
			await UserFactory.create({
				profile: { inGameName: `${name}#${DISCRIMINATOR}` },
			}),
		);
	}
	return users;
}

function groupMatchMaps(matchId: number) {
	return db
		.selectFrom("GroupMatchMap")
		.selectAll()
		.where("matchId", "=", matchId)
		.orderBy("index", "asc")
		.execute();
}

/**
 * Backdates the set's reported maps so they look played minutes apart ending
 * at `reportedThrough`, rather than all inside the same test second.
 * Production reports a map as it finishes, and matching leans on that spacing
 * to tell two plays of one map apart.
 */
async function stampMapReports(matchId: number, reportedThrough: Date) {
	const reported = (await groupMatchMaps(matchId)).filter(
		(map) => map.winnerGroupId !== null,
	);

	for (const [position, map] of reported.entries()) {
		await backdate("GroupMatchMap", map.id, {
			reportedAt: subMinutes(
				reportedThrough,
				(reported.length - 1 - position) * MAP_REPORT_STAGGER_MINUTES,
			),
		});
	}
}

/** Plays the match out, alpha winning every map, both teams agreeing on the score. */
async function concludeGroupMatch(matchId: number) {
	const match = await SQMatchRepository.findById(matchId);
	invariant(match, "Match not found");

	const winnerId = match.groupAlpha.id;
	const reportedByUserId = match.groupAlpha.members[0]!.id;

	let reportedCount = 0;
	let result = await SQMatchRepository.reportMapWinner({
		matchId,
		winnerId,
		reportedByUserId,
		reportedCount,
	});
	while (result.status === "MAP_REPORTED") {
		reportedCount++;
		result = await SQMatchRepository.reportMapWinner({
			matchId,
			winnerId,
			reportedByUserId,
			reportedCount,
		});
	}
	invariant(
		result.status === "MATCH_REPORTED",
		`Reporting the deciding map resulted in ${result.status}`,
	);

	const confirmation = await SQMatchRepository.reportMapWinner({
		matchId,
		winnerId,
		reportedByUserId: match.groupBravo.members[0]!.id,
		reportedCount: reportedCount + 1,
	});
	invariant(
		confirmation.status === "MATCH_FINALIZED",
		`Confirming the score resulted in ${confirmation.status}`,
	);
}

/**
 * Backdates match `startedAt`s and game result `createdAt`s into the recent
 * past, staggered in play order: everything production stamps within the
 * same test second becomes an unambiguous timeline, so "latest match" and
 * game order come out the same on every run.
 *
 * @returns each set's `startedAt`, keyed by match id
 */
async function staggerTournamentTimeline(
	matches: Array<{ id: number }>,
): Promise<Map<number, Date>> {
	const now = new Date();
	const startedAtByMatchId = new Map<number, Date>();

	for (const [matchIdx, match] of matches.entries()) {
		const startedAt = subMinutes(
			now,
			(matches.length - matchIdx) * SET_STAGGER_MINUTES,
		);
		startedAtByMatchId.set(match.id, startedAt);
		await backdate("TournamentMatch", match.id, { startedAt });

		const games = await db
			.selectFrom("TournamentMatchGameResult")
			.select(["id", "number"])
			.where("matchId", "=", match.id)
			.execute();
		for (const game of games) {
			await backdate("TournamentMatchGameResult", game.id, {
				createdAt: addMinutes(startedAt, game.number),
			});
		}
	}

	return startedAtByMatchId;
}

function scannedTeam(
	names: string[],
	weaponOffset: number,
	weaponFor?: (name: string) => MainWeaponId,
) {
	return {
		players: names.map((name, index) => ({
			name,
			weaponId: weaponFor?.(name) ?? WEAPONS[weaponOffset + index]!,
			paint: 1000 + (weaponOffset + index) * 100,
			ka: 20 - (weaponOffset + index),
			d: weaponOffset + index,
			s: 8 - (weaponOffset + index),
		})),
	};
}

function renamedTeam(
	match: ScannerMatch,
	teamIndex: 0 | 1,
	rename: (name: string, rowIndex: number) => string,
) {
	return {
		players: match.teams[teamIndex].players.map((player, playerIndex) => ({
			...player,
			name:
				player.name === null
					? null
					: rename(player.name, teamIndex * PLAYERS_PER_TEAM + playerIndex),
		})),
	};
}
