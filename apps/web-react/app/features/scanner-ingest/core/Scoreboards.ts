import type {
	ScannerMatch,
	ScannerMatchObjective,
	ScannerMatchPlayerStatus,
} from "~/features/scanner/core/scanner-match";
import type { ScannerLobby } from "~/features/scanner/scanner-types";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import * as Matches from "./Matches";

/** Lobby header value scoreboards of tournament/SendouQ games are expected to have. */
const TOURNAMENT_LOBBY = "PRIVATE";

/**
 * How many of the 8 player rows must carry the same readable name in the
 * same position for a match to count as a re-detection of a game's
 * already linked scoreboard (allows a couple of OCR misreads).
 */
const MIN_LINKED_DUPLICATE_NAME_MATCHES = 6;

/** How many players on the winning (first) resp. losing side of a scoreboard. */
const PLAYERS_PER_TEAM = 4;

/**
 * How many matches must align with one context's games for content
 * resolution to trust it. A single game's (mode, stage, sides) is common
 * across a user's history; two already carry order.
 */
const MIN_RESOLVED_SCOREBOARDS = 2;

/**
 * How far a scan's play time may sit from a game's report for the two to
 * still be the same game. Reporting follows the game by minutes, so this is
 * mostly headroom for a slow reporter and for the scan's clock (the client's
 * own) — while staying far inside the gap between two plays of one map. A
 * scan that lands outside every candidate stays unlinked rather than
 * guessing: an unlinked scan keeps its hint and can be re-sent, a wrongly
 * linked one silently puts strangers on a match page.
 */
const PLAYED_AT_TOLERANCE_MS = 30 * 60 * 1000;

/** The match context an ingest request was resolved to belong to. */
export type IngestContext =
	| { type: "tournament"; tournamentId: number }
	| { type: "sendouq"; groupMatchId: number };

/** The reported game result an ingested match can link to. */
export type IngestableGameTarget =
	| {
			type: "tournament";
			matchGameResultId: number;
			tournamentMatchId: number;
	  }
	| { type: "sendouq"; groupMatchMapId: number; groupMatchId: number };

/** A game of a tournament or SendouQ match that ingested matches can be linked to. */
export interface IngestableGame {
	target: IngestableGameTarget;
	/** 0-based index of the game within its match */
	mapIndex: number;
	mode: ModeShort;
	stageId: StageId;
	/** user ids of the winning team's roster; the POV sender's side pins the scan's sides to the game's teams */
	winnerUserIds: number[];
	/** user ids of the losing team's roster; the POV sender's side pins the scan's sides to the game's teams */
	loserUserIds: number[];
	/** known in-game names of the winning team's roster, the side fallback for reads without a POV seat */
	winnerInGameNames: string[];
	/** known in-game names of the losing team's roster, the side fallback for reads without a POV seat */
	loserInGameNames: string[];
	/**
	 * database timestamp of the game's own report — both the chronological
	 * ordering key across matches and what a scan's play time is measured
	 * against to tell two plays of one map apart
	 */
	playedAt: number;
	/**
	 * player names (winner-first, in scoreboard row order) of an already
	 * linked ingested match of the game; null when the game has none yet.
	 * Lets matching skip taken games across requests while recognizing
	 * re-detections of the same scoreboard.
	 */
	linkedPlayerNames: string[] | null;
}

/** A candidate game for content resolution, tagged with its context. */
export interface IngestableGameWithContext extends IngestableGame {
	context: IngestContext;
}

export interface MatchedGame {
	/** index into the input `matches` array */
	matchIndex: number;
	game: IngestableGame;
}

/** Stable grouping/equality key for an {@link IngestContext}. */
export function contextKey(context: IngestContext): string {
	return context.type === "tournament"
		? `tournament:${context.tournamentId}`
		: `sendouq:${context.groupMatchId}`;
}

/**
 * Resolves which context (tournament or SendouQ match) a request's matches
 * belong to from their content alone: the candidate games (the POV user's
 * reported games) are grouped by context and each context is scored by how
 * many matches `matchedGames` aligns with its games — the same mode+stage
 * sequence walk and roster-side validation that decides what would actually
 * be linked.
 */
export function resolveContext({
	matches,
	games,
	povUserId = null,
}: {
	matches: ScannerMatch[];
	games: IngestableGameWithContext[];
	povUserId?: number | null;
}): IngestContext | null {
	const byContext = new Map<string, IngestableGameWithContext[]>();
	for (const game of games) {
		const key = contextKey(game.context);
		const contextGames = byContext.get(key) ?? [];
		contextGames.push(game);
		byContext.set(key, contextGames);
	}

	let best: { context: IngestContext; matched: number } | null = null;
	for (const contextGames of byContext.values()) {
		const matched = matchedGames({
			matches,
			games: contextGames,
			povUserId,
		}).length;
		if (!best || matched > best.matched) {
			best = { context: contextGames[0]!.context, matched };
		}
	}

	if (!best || best.matched < MIN_RESOLVED_SCOREBOARDS) return null;
	return best.context;
}

/**
 * Matches ingested matches against a context's games, deciding which game
 * result each match should link to.
 *
 * Only matches whose winner is known with two full teams qualify (a
 * minimap-only match can never link — its winner and stats are unread).
 * Matches and games are both walked in chronological order: each match is
 * assigned to a not-yet-assigned game with the same mode and stage whose
 * sides agree with what is known. Among those, a match carrying a wall clock
 * takes the game reported nearest it (and none at all when every candidate
 * is further off than `PLAYED_AT_TOLERANCE_MS`); a match without one — a VoD
 * read, whose times are offsets into a video — takes the next in sequence,
 * which is what the chronological walk is for.
 *
 * The POV seat decides the sides where it can: the sender is the POV player,
 * so which of the game's rosters they belong to pins the scan's sides to the
 * game's teams — OCR'd names are too
 * unreliable to overrule it. Only when no seat can decide (cast footage, no
 * POV read) do the known in-game names arbitrate the sides. Matches from
 * other lobbies, with unreadable mode/stage or duplicated detections of the
 * same game are skipped.
 *
 * One session's matches may arrive over many requests (one per game), so
 * games another ingest already linked to are skipped — unless the incoming
 * match is a re-detection of the linked one, which is matched to the same
 * game so re-sends stay idempotent and another POV's scan of the same game
 * lands on it too.
 */
export function matchedGames({
	matches,
	games,
	povUserId = null,
}: {
	matches: ScannerMatch[];
	games: IngestableGame[];
	/** the sender, who is the POV player of the request's non-cast matches */
	povUserId?: number | null;
}): MatchedGame[] {
	const views = dedupeViews(
		matches
			.map((match, matchIndex) => {
				const view = winnerFirstView(match, matchIndex);
				return view ? { ...view, matchIndex } : null;
			})
			.filter((view): view is IndexedView => view !== null)
			.filter((view) => !view.lobby || view.lobby === TOURNAMENT_LOBBY)
			.sort((a, b) => a.order - b.order),
	);
	const orderedGames = games.toSorted(
		(a, b) => a.playedAt - b.playedAt || a.mapIndex - b.mapIndex,
	);

	const result: MatchedGame[] = [];

	let nextGameIdx = 0;
	for (const view of views) {
		if (view.mode === null || view.stage === null) continue;

		const gameIdx = pickGame(view, orderedGames, nextGameIdx, povUserId);
		if (gameIdx === null) continue;

		result.push({ matchIndex: view.matchIndex, game: orderedGames[gameIdx]! });
		nextGameIdx = gameIdx + 1;
	}

	return result;
}

export interface IngestedScoreboardPlayer {
	name: string;
	tournamentTeamId: number | null;
	weaponSplId: MainWeaponId | null;
	ka: number | null;
	d: number | null;
	s: number | null;
	paint: number | null;
	/** [head, clothes, shoes] ability rows gathered from the match's death screens */
	abilities?: AbilityWithUnknown[][];
	/** set via POV attribution of a linked ingested match */
	userId?: number;
}

/**
 * The scoreboard of a game derived from its linked ingested matches — the
 * shape match pages render. Derived at read time, not stored.
 */
export interface IngestedScoreboardData {
	/** game scores [winner, loser] (0-100; a knockout's winner is 100) */
	scores: [number | null, number | null];
	/** in scoreboard order: rows 0-3 winning team, rows 4-7 losing team */
	players: IngestedScoreboardPlayer[];
	/**
	 * objective-counter progress of the game, per-team values [winner, loser]
	 * and sample `t` in seconds since the game's first read (the source video
	 * the raw values are offsets into is not stored). Absent when no counter
	 * was read.
	 */
	objective?: ScannerMatchObjective;
	/**
	 * per-player special/death samples, teams winner-first and `t` rebased
	 * onto the same origin as `objective` so both chart on one axis. Absent
	 * when the icon strip was never read.
	 */
	playerStatus?: ScannerMatchPlayerStatus;
}

/**
 * Derives a game's scoreboard from its linked ingested matches: the earliest
 * link is the base and later ones enrich it (first-ingest-wins field-wise,
 * via Matches.mergeMatches), the merged match is projected winner-first, and
 * every linked POV seat attributes its player row to the POV user.
 *
 * `winnerTeamId`/`loserTeamId` are the game result's sides (tournament team
 * or SendouQ group ids), stamped onto the rows for the reader.
 */
export function deriveScoreboardData({
	linked,
	winnerTeamId,
	loserTeamId,
}: {
	/** in link order, earliest first */
	linked: Array<{ data: ScannerMatch; povUserId: number | null }>;
	winnerTeamId: number;
	loserTeamId: number | null;
}): IngestedScoreboardData | null {
	const [first, ...rest] = linked;
	if (!first) return null;

	let merged = first.data;
	for (const other of rest) {
		merged = Matches.mergeMatches(merged, other.data).merged;
	}

	const view = winnerFirstView(merged, 0);
	if (!view) return null;

	const players = view.players.map(
		(player, playerIdx): IngestedScoreboardPlayer => ({
			name: player.name.trim(),
			tournamentTeamId:
				playerIdx < PLAYERS_PER_TEAM ? winnerTeamId : loserTeamId,
			weaponSplId: player.weaponId,
			ka: player.ka,
			d: player.d,
			s: player.s,
			paint: player.paint,
			...(player.abilities ? { abilities: player.abilities } : null),
		}),
	);

	attributePovUsers(players, linked);

	return {
		scores: view.scores,
		players,
		...(view.objective ? { objective: view.objective } : null),
		...(view.playerStatus ? { playerStatus: view.playerStatus } : null),
	};
}

/**
 * A match's players winner-first in scoreboard row order (unread names as
 * empty strings), or null when the match has no such view — the
 * `linkedPlayerNames` a game's already linked ingest contributes.
 */
export function winnerFirstPlayerNames(match: ScannerMatch): string[] | null {
	const view = winnerFirstView(match, 0);
	return view ? view.players.map((player) => player.name.trim()) : null;
}

/**
 * A match's players in linked-scoreboard order — winning team's rows first —
 * with unread names as empty strings. Null when the match can't link: its
 * winner is unknown or either team wasn't fully seen.
 */
interface WinnerFirstView {
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	stage: StageId | null;
	/** game scores [winner, loser] from the match's "Score:" banner */
	scores: [number | null, number | null];
	players: WinnerFirstPlayer[];
	/** counter progress with both the sides and `t` already winner-first */
	objective: ScannerMatchObjective | null;
	/** status samples winner-first, on the same rebased `t` axis */
	playerStatus: ScannerMatchPlayerStatus | null;
	povIndex: number | null;
	/** wall-clock ms the game was played, when the read carried a clock at all */
	playedAt: number | null;
	/** chronological walk key: wall-clock, else video time, else input order */
	order: number;
}

interface IndexedView extends WinnerFirstView {
	matchIndex: number;
}

interface WinnerFirstPlayer {
	name: string;
	weaponId: MainWeaponId | null;
	paint: number | null;
	ka: number | null;
	d: number | null;
	s: number | null;
	abilities?: AbilityWithUnknown[][];
}

function winnerFirstView(
	match: ScannerMatch,
	index: number,
): WinnerFirstView | null {
	if (match.winner === null) return null;
	const winners = match.teams[match.winner];
	const losers = match.teams[match.winner === 0 ? 1 : 0];
	if (
		winners.players.length !== PLAYERS_PER_TEAM ||
		losers.players.length !== PLAYERS_PER_TEAM
	) {
		return null;
	}

	const progressFirstT = firstProgressT(match);

	return {
		lobby: match.lobby,
		mode: match.mode,
		stage: match.stage,
		scores: [
			match.matchScores?.[match.winner] ?? null,
			match.matchScores?.[match.winner === 0 ? 1 : 0] ?? null,
		],
		players: [...winners.players, ...losers.players].map((player) => ({
			...player,
			name: player.name ?? "",
		})),
		objective: winnerFirstObjective(
			match.objective,
			match.winner,
			progressFirstT,
		),
		playerStatus: winnerFirstPlayerStatus(
			match.playerStatus ?? null,
			match.winner,
			progressFirstT,
		),
		povIndex:
			match.pov === null
				? null
				: match.pov.team === match.winner
					? match.pov.index
					: PLAYERS_PER_TEAM + match.pov.index,
		playedAt: match.playedAt,
		order: match.playedAt ?? match.startsAt ?? index,
	};
}

/**
 * The shared `t` origin of a match's progress series: the earliest counter
 * or status read, so both rebase onto one axis and stay aligned without
 * the source video.
 */
function firstProgressT(match: ScannerMatch): number {
	const ts = [
		...(match.objective?.samples ?? []).map((sample) => sample.t),
		...(match.playerStatus?.samples ?? []).map((sample) => sample.t),
	];
	return ts.length > 0 ? Math.min(...ts) : 0;
}

/**
 * Puts a match's counter samples in derived-scoreboard shape: per-team
 * values winner-first like `scores` and `players`, and `t` rebased to the
 * game's first progress read so the samples stay meaningful without the
 * source video.
 */
function winnerFirstObjective(
	objective: ScannerMatchObjective | null,
	winner: 0 | 1,
	firstT: number,
): ScannerMatchObjective | null {
	if (!objective || objective.samples.length === 0) return null;

	const winnerFirst = <T>(pair: [T, T]): [T, T] =>
		winner === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]];

	return {
		mode: objective.mode,
		samples: objective.samples.map((sample) => ({
			t: sample.t - firstT,
			time: sample.time,
			score: winnerFirst(sample.score),
			penalty: winnerFirst(sample.penalty),
			control: winnerFirst(sample.control),
		})),
	};
}

/** The status samples winner-first on the shared rebased `t` axis. */
function winnerFirstPlayerStatus(
	playerStatus: ScannerMatchPlayerStatus | null,
	winner: 0 | 1,
	firstT: number,
): ScannerMatchPlayerStatus | null {
	if (!playerStatus || playerStatus.samples.length === 0) return null;

	const winnerFirst = <T>(pair: [T, T]): [T, T] =>
		winner === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]];

	return {
		samples: playerStatus.samples.map((sample) => ({
			t: sample.t - firstT,
			time: sample.time,
			special: winnerFirst(sample.special),
			dead: winnerFirst(sample.dead),
		})),
	};
}

/**
 * Attributes each linked match's POV seat to its POV user on the merged
 * rows: the seat's read name picks the row (unique name match), falling
 * back to the seat's own winner-first position when the names don't
 * contradict. A row already attributed, or a user already present, is left
 * alone (first link wins).
 */
function attributePovUsers(
	players: IngestedScoreboardPlayer[],
	linked: Array<{ data: ScannerMatch; povUserId: number | null }>,
) {
	for (const { data, povUserId } of linked) {
		if (povUserId === null || data.pov === null) continue;
		const view = winnerFirstView(data, 0);
		if (!view || view.povIndex === null) continue;
		if (players.some((player) => player.userId === povUserId)) continue;

		const povName = Matches.normalizeInGameName(
			view.players[view.povIndex]!.name,
		);
		const index = attributionIndex(players, povName, view.povIndex);
		if (index === null || players[index]!.userId !== undefined) continue;

		players[index] = { ...players[index]!, userId: povUserId };
	}
}

function attributionIndex(
	players: IngestedScoreboardPlayer[],
	povName: string,
	fallbackIndex: number,
): number | null {
	if (povName) {
		const hits = players.flatMap((player, index) =>
			Matches.normalizeInGameName(player.name) === povName ? [index] : [],
		);
		if (hits.length === 1) return hits[0]!;
	}

	const fallback = players[fallbackIndex];
	if (!fallback) return null;
	const fallbackName = Matches.normalizeInGameName(fallback.name);
	if (povName && fallbackName && fallbackName !== povName) return null;
	return fallbackIndex;
}

/**
 * Drops re-detections of the same game within one request: same mode and
 * stage with enough player rows carrying the same readable name in the same
 * position — the same OCR-jitter tolerance as the cross-request duplicate
 * check (isLinkedDuplicate).
 */
function dedupeViews(sorted: IndexedView[]): IndexedView[] {
	const result: IndexedView[] = [];

	for (const view of sorted) {
		const isDuplicate = result.some(
			(other) =>
				other.mode === view.mode &&
				other.stage === view.stage &&
				isLinkedDuplicate(
					view,
					other.players.map((player) => player.name),
				),
		);
		if (!isDuplicate) result.push(view);
	}

	return result;
}

/**
 * The index of the game `view` should link to, or null when none fits. Only
 * games from `from` on are considered, so two scans of one request never
 * take the same game and the sequence stays ordered.
 *
 * A scan that knows when it was played takes the candidate reported nearest
 * that moment, which keeps two plays of one map apart — they sit minutes
 * from their own report and a session apart from each other. One that does
 * not takes the next candidate in sequence.
 */
function pickGame(
	view: IndexedView,
	orderedGames: IngestableGame[],
	from: number,
	povUserId: number | null,
): number | null {
	let best: { index: number; distance: number } | null = null;

	for (let i = from; i < orderedGames.length; i++) {
		const game = orderedGames[i]!;
		if (!canLink(view, game, povUserId)) continue;
		if (view.playedAt === null) return i;

		const distance = Math.abs(
			view.playedAt - databaseTimestampToJavascriptTimestamp(game.playedAt),
		);
		if (distance > PLAYED_AT_TOLERANCE_MS) continue;
		if (!best || distance < best.distance) best = { index: i, distance };
	}

	return best?.index ?? null;
}

/**
 * Whether a game is a candidate for a scan at all: the same map, and sides
 * that do not contradict — an already linked game only through being a
 * re-detection of the scan already on it.
 */
function canLink(
	view: WinnerFirstView,
	game: IngestableGame,
	povUserId: number | null,
): boolean {
	if (game.mode !== view.mode || game.stageId !== view.stage) return false;

	if (game.linkedPlayerNames) {
		return isLinkedDuplicate(view, game.linkedPlayerNames);
	}

	const agreement = povSideAgreement(view, game, povUserId);
	if (agreement === false) return false;
	return agreement !== null || sidesMatchKnownPlayers(view, game);
}

/**
 * Whether the POV seat's side in the scan agrees with the sender's side in
 * the game: the sender is the POV player, so the roster their user id sits
 * in says whether their seat should be on the winning rows. Null when the
 * check cannot decide — no POV seat read, no sender, or the sender in
 * neither roster (cast footage) — leaving the sides to the name fallback.
 */
function povSideAgreement(
	view: WinnerFirstView,
	game: IngestableGame,
	povUserId: number | null,
): boolean | null {
	if (povUserId === null || view.povIndex === null) return null;

	const povOnWinningSide = view.povIndex < PLAYERS_PER_TEAM;
	if (game.winnerUserIds.includes(povUserId)) return povOnWinningSide;
	if (game.loserUserIds.includes(povUserId)) return !povOnWinningSide;
	return null;
}

/**
 * The side fallback for reads no POV seat can pin (cast footage above all):
 * the winning rows should overlap the game winner's in-game names at least
 * as well as the losing team's (and vice versa). A contradiction means the
 * match belongs to some other game. No overlap at all (e.g. no in-game
 * names set) counts as a pass.
 */
function sidesMatchKnownPlayers(view: WinnerFirstView, game: IngestableGame) {
	const winnerSide = view.players
		.slice(0, PLAYERS_PER_TEAM)
		.map((player) => Matches.normalizeInGameName(player.name));
	const loserSide = view.players
		.slice(PLAYERS_PER_TEAM)
		.map((player) => Matches.normalizeInGameName(player.name));

	const knownWinners = game.winnerInGameNames.map(Matches.normalizeInGameName);
	const knownLosers = game.loserInGameNames.map(Matches.normalizeInGameName);

	const straight =
		nameOverlap(winnerSide, knownWinners) + nameOverlap(loserSide, knownLosers);
	const flipped =
		nameOverlap(winnerSide, knownLosers) + nameOverlap(loserSide, knownWinners);

	return straight >= flipped;
}

function nameOverlap(names: string[], knownNames: string[]) {
	const known = new Set(knownNames.filter(Boolean));
	return names.filter((name) => name && known.has(name)).length;
}

/**
 * Checks whether a match is a re-detection of a game's already linked
 * scoreboard: enough player rows carry the same readable name in the same
 * position. Positional comparison keeps two games between the same eight
 * players apart — their row orders and sides practically always differ.
 */
function isLinkedDuplicate(view: WinnerFirstView, linkedPlayerNames: string[]) {
	const matches = view.players.filter((player, i) => {
		const name = Matches.normalizeInGameName(player.name);
		const linkedName = linkedPlayerNames[i]
			? Matches.normalizeInGameName(linkedPlayerNames[i]!)
			: "";
		return name !== "" && name === linkedName;
	}).length;

	return matches >= MIN_LINKED_DUPLICATE_NAME_MATCHES;
}
