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

/** Of 8 player rows, how many must share name and position for a match to count as a re-detection (tolerates a couple of OCR misreads). */
const MIN_LINKED_DUPLICATE_NAME_MATCHES = 6;

/** How many players on the winning (first) resp. losing side of a scoreboard. */
const PLAYERS_PER_TEAM = 4;

/** Matches that must align with one context's games before content resolution trusts it: one (mode, stage, sides) is common across a user's history, two carry order. */
const MIN_RESOLVED_SCOREBOARDS = 2;

/**
 * Max distance between a scan's play time and a game's report for them to be the same game:
 * headroom for a slow reporter and the client's clock, still far inside the gap between two
 * plays of one map. Outside every candidate the scan stays unlinked (re-sendable) rather than
 * silently putting strangers on a match page.
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
	/** timestamp of the game's report: the chronological key and what a scan's play time is measured against */
	playedAt: number;
	/** winner-first row-order names of an already linked ingest of the game, null when none; lets matching skip taken games yet recognize re-detections */
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
 * Resolves which context (tournament or SendouQ match) a request's matches belong to from content
 * alone: the POV user's reported games are grouped by context and each is scored by how many
 * matches `matchedGames` aligns with its games.
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
 * Decides which game result each ingested match links to.
 *
 * Only matches with a known winner and two full teams qualify (minimap-only reads never link).
 * Matches and games are walked chronologically: each match takes an unassigned game of the same
 * mode+stage whose sides agree with what is known. A match with a wall clock takes the game
 * reported nearest it (none beyond `PLAYED_AT_TOLERANCE_MS`); a VoD read (video offsets only)
 * takes the next in sequence.
 *
 * The sender is the POV player, so the roster they sit in pins the scan's sides — OCR'd names
 * are too unreliable to overrule it. Only without a POV seat (cast footage) do in-game names
 * arbitrate. Other lobbies, unreadable mode/stage and duplicate detections are skipped.
 *
 * Matches arrive over many requests, so games already linked are skipped — unless the incoming
 * match is a re-detection of the linked one, which lands on the same game so re-sends stay
 * idempotent and another POV's scan joins it.
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

/** A game's scoreboard derived from its linked ingested matches, the shape match pages render. Derived at read time, not stored. */
export interface IngestedScoreboardData {
	/** game scores [winner, loser] (0-100; a knockout's winner is 100) */
	scores: [number | null, number | null];
	/** in scoreboard order: rows 0-3 winning team, rows 4-7 losing team */
	players: IngestedScoreboardPlayer[];
	/** objective-counter progress, per-team values [winner, loser], `t` in seconds since the game's first read (the source video is not stored). Absent when no counter was read. */
	objective?: ScannerMatchObjective;
	/** per-player special/death samples, teams winner-first, `t` on the same origin as `objective`. Absent when the icon strip was never read. */
	playerStatus?: ScannerMatchPlayerStatus;
}

/**
 * Derives a game's scoreboard from its linked ingests: earliest link is the base, later ones
 * enrich it field-wise (Matches.mergeMatches), projected winner-first, with every linked POV seat
 * attributing its row to the POV user. `winnerTeamId`/`loserTeamId` are the result's sides
 * (tournament team or SendouQ group ids) stamped onto the rows.
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

/** A match's players winner-first in row order (unread names as ""), or null without such a view — a game's `linkedPlayerNames`. */
export function winnerFirstPlayerNames(match: ScannerMatch): string[] | null {
	const view = winnerFirstView(match, 0);
	return view ? view.players.map((player) => player.name.trim()) : null;
}

/** Winner-first row view of a match (unread names as ""). Null when it can't link: unknown winner or a team not fully seen. */
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

/** Shared `t` origin of a match's progress series: the earliest counter or status read. */
function firstProgressT(match: ScannerMatch): number {
	const ts = [
		...(match.objective?.samples ?? []).map((sample) => sample.t),
		...(match.playerStatus?.samples ?? []).map((sample) => sample.t),
	];
	return ts.length > 0 ? Math.min(...ts) : 0;
}

/** Counter samples winner-first with `t` rebased to the game's first progress read. */
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
 * Attributes each linked POV seat to its user on the merged rows: unique name match picks the
 * row, else the seat's own winner-first position when names don't contradict. Already attributed
 * rows and already present users are left alone (first link wins).
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

/** Drops re-detections of the same game within one request, with the same OCR-jitter tolerance as isLinkedDuplicate. */
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
 * Index of the game `view` links to, or null. Only games from `from` on are considered so two
 * scans of one request never take the same game. A scan with a play time takes the candidate
 * reported nearest it (keeps two plays of one map apart); one without takes the next in sequence.
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

/** Same map and non-contradicting sides; an already linked game only as a re-detection of the scan on it. */
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
 * Whether the POV seat's side agrees with the roster the sender sits in. Null when undecidable
 * (no POV seat, no sender, or sender in neither roster — cast footage), leaving it to the name fallback.
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
 * Side fallback when no POV seat can pin (cast footage): winning rows must overlap the winner's
 * in-game names at least as well as the loser's, and vice versa. No overlap at all passes.
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

/** Re-detection check: enough rows share name and position. Positional so two games between the same eight players stay apart. */
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
