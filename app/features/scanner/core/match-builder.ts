/**
 * Groups a detected-event timeline into ScannerMatch objects
 * (scanner-match.ts) in three steps:
 *
 * 1. segments (game-segments.ts): the gameplay of each game, split at map
 *    intros, lobby screens, the clock starting another game and minimap stage
 *    changes, each followed by the lobby screens shown after it;
 * 2. game identities (game-identity.ts): which results and history screens
 *    show the same game, by their paint totals and stat lines alone;
 * 3. assignment (`assignGames`): which identity closes which segment. A
 *    revisit, a replay played back, a missed intro or a missed results screen
 *    is an ordinary outcome of it, not a repair of an earlier decision.
 *
 * The built matches' player names are then voted on across the session
 * (name-roster.ts).
 *
 * A match is emitted only when a scoreboard, a personal results screen,
 * minimaps or a played counter back it, regardless of lobby/outcome —
 * `ingestSkipReasons` filters those (the clip scorer alone asks for the
 * unbacked ones too). Deaths are harvested onto player rows as enemy builds
 * (ability-harvest.ts).
 */
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { weaponIdToBaseWeaponId } from "~/modules/in-game-lists/weapon-ids";
import { isUploadedLobby } from "../scanner-types";
import {
	type GearMains,
	harvestAbilities,
	harvestCardMains,
} from "./ability-harvest";
import * as Clock from "./clock";
import type { DeathData } from "./detectors/death/index";
import type { KillData } from "./detectors/kill/index";
import { MAP_START_EVENT_TYPE } from "./detectors/map-start/index";
import type {
	MINIMAP_EVENT_TYPE,
	MinimapData,
} from "./detectors/minimap/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "./detectors/objective/index";
import {
	FLAGGED_STATE_EVIDENCE,
	type PlayerStatusData,
	type PlayerStatusFlags,
	type SlotEvidence,
	statusFlagsOf,
} from "./detectors/objective/player-status";
import type { StripWeaponsData } from "./detectors/objective/strip-weapons";
import {
	SCOREBOARD_EVENT_TYPE,
	type ScoreboardData,
} from "./detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE } from "./detectors/scoreboard-battle-log-replay/index";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "./detectors/scoreboard-own/index";
import {
	type DetectedEvent,
	type EventOfType,
	isEventOfType,
	isHistoryScoreboardEvent,
	isScoreboardEvent,
	isXBattleCardEvent,
	type ScoreboardFamilyEvent,
	type XBattleCardEvent,
} from "./events";
import * as FieldScores from "./field-scores";
import * as GameIdentity from "./game-identity";
import * as GameSegments from "./game-segments";
import { hueDistance, hueOf, type InkRgb } from "./ink-color";
import * as NameRoster from "./name-roster";
import {
	type ScannerMatch,
	type ScannerMatchKill,
	type ScannerMatchObjective,
	type ScannerMatchObjectiveSample,
	type ScannerMatchPlayer,
	type ScannerMatchPlayerStatus,
	type ScannerMatchPlayerStatusSample,
	type ScannerMatchTeam,
	victimSlot,
} from "./scanner-match";
import {
	addStatusEvidence,
	addWeaponEvidence,
	applyPermutation,
	decidedRowSlots,
	emptySlotRowEvidence,
	IDENTITY_PERMUTATION,
	nameSlotRowPermutation,
	rowByName,
	type SlotRowEvidence,
	type SlotRowPermutation,
	type StatusObservation,
	type StripSnapshot,
	slotRowPermutation,
} from "./slot-row-assignment";
import * as StatusDecode from "./status-decode";
import { nameSimilarity } from "./text";
import { renamedRows } from "./timeline/same-scoreboard";

/** How far back a board closing a game with no intro or minimap claims its gameplay: matches run well under 8 min. */
const FALLBACK_WINDOW_SECONDS = 480;

/**
 * Counter reads spanning this long after a map intro show a game being played,
 * enough to back a match with no results screen or minimap read.
 */
const MIN_PLAYED_COUNTER_SECONDS = 60;

/**
 * A map intro this soon after a replay-browser entry is that replay being played
 * back (attested 6-9s of loading).
 */
const REPLAY_LOAD_MAX_SECONDS = 30;

const PLAYERS_PER_TEAM = 4;

/**
 * Slack before calling a match a disconnect: a counter read is a snapshot of
 * moving numbers, and the results screen is read seconds after the last whistle.
 */
const EARLY_END_MARGIN_SECONDS = 10;

/** Game clock lengths: a full game's results screen comes no sooner after its intro. */
const TURF_WAR_CLOCK_SECONDS = 180;
const RANKED_CLOCK_SECONDS = 300;

/**
 * Minimum hue distance between the two team inks before color orients counter
 * reads: attested pairs measure >130° apart, so a closer seed pair is a misread
 * and orientation falls back to the as-read arrangement.
 */
const MIN_TEAM_HUE_SEPARATION = 30;

/**
 * Kill-feed stack reads further apart than this show independent rows even
 * when the names repeat: a splatted player respawns in ~8.5s, so a repeated
 * name inside it is the same row still up. How long a row stays up is
 * unattested beyond single frames; a row outliving this would count twice.
 */
const KILL_ROW_LIFETIME_SECONDS = 5;

/** Name similarity (1 - edits / length) at which two stack reads show the same row. */
const KILL_SAME_ROW_MIN_SIMILARITY = 0.7;

/**
 * Offsets between the console and the PC clock this close agree: the console
 * shows minutes, and a game's first read can come a few minutes in (the intro
 * missed).
 */
const CONSOLE_OFFSET_AGREEMENT_MS = 5 * 60 * 1000;

/** Distinct games and history screens, paired one to one, that must agree on a console clock offset before it is taken. */
const CONSOLE_OFFSET_MIN_SUPPORT = 2;

/**
 * The personal results screen comes before its game's results screen (then
 * the X Battle cards and the pay-out; 1-23 s before on footage). One no game
 * being gathered took joins the game whose closing board comes first within
 * this after it.
 */
const OWN_RESULTS_WINDOW_SECONDS = 90;

/**
 * The X Battle lobby cards (set count, set result, position) report on the
 * game just played: the lobby shows them after the personal results screen
 * and before the results screen, so they normally join the game still being
 * gathered. A card seen within this of a match closed before it (results
 * screen read first) joins that match; a card with no game before it waits
 * this long for a results screen to claim it.
 */
const X_BATTLE_CARDS_WINDOW_SECONDS = 90;

export interface BuiltMatch<E extends DetectedEvent> {
	match: ScannerMatch;
	/** input events the match was built from, chronological — the send-status unit for callers */
	sources: E[];
	/**
	 * only built with `{ unbacked: true }`: no scoreboard, minimap or played
	 * counter backs the match, so it is kill-feed material for clips, not a
	 * game to show or send
	 */
	unbacked?: true;
	/** each team's ink as the minimap showed it, in `teams` order; null when the minimap was never read */
	inks?: [InkRgb | null, InkRgb | null] | null;
}

/**
 * Lets a caller rebuilding a growing timeline reuse each match whose input
 * events are the very same objects as last time, so the per-match work runs
 * only for matches that changed and unchanged ones keep their identity. Keyed
 * by a match's closing board, else its first input event; events must not be
 * mutated in place. Boards showing the game again and the screens joining it
 * after its results screen are put on the cached match, not built into it.
 */
export type MatchBuildCache<E extends DetectedEvent> = WeakMap<
	E,
	{ inputs: readonly E[]; built: BuiltMatch<E> }
>;

/**
 * Splits a timeline into ScannerMatch objects, chronological.
 *
 * The board closing a game is the first one in its segment's tail (the lobby
 * screens after its gameplay) that shows a game no earlier segment closed and
 * not one shown before the game was played, and that the game's own reads
 * don't contradict: a history screen of another stage, mode or recording time
 * (`isHistoryOfAnotherGame`) leaves the game open, so a missed results screen
 * is amended from the log. A no-contest results screen (DRAW tags: the host
 * ended the game, an early disconnect) before any of them discards the game: it
 * has no result, and its replay forms the real match. A game whose intro comes
 * right after a replay-browser entry of its stage and mode is that replay
 * played back, closed by the entry. A history screen showing a game no tail
 * closed completes an earlier game left without a results screen when one
 * fits (`missedResultsGame`), else it forms a match of its own; one with its
 * stage unread forms none. Every other board of a game's identity (the battle
 * log browsed later, a results screen read again) joins its match's
 * `sources`, putting the real names it reveals on an X Battle's aliased
 * results.
 *
 * A personal results screen joins the game it follows (matchmade lobbies show
 * it before the results screen, Anarchy Series often with none after it): its
 * lobby, mode and stage stand in for a missing results screen's and its build
 * completes the POV player's. The X Battle lobby cards (shown before that
 * game's results screen) join the sources of the game they report on. Every
 * input event ends up in at most one match's `sources`.
 *
 * A player name a game misread takes the spelling the other games of its
 * team read (`withRosterNames`).
 *
 * `unbacked` also emits, flagged, the segments with kill reads no scoreboard,
 * minimap or played counter backed (a results screen missed, the map never
 * opened, a match still being played): the clip scorer needs their streaks,
 * nothing else should see them.
 */
export function buildScannerMatches<E extends DetectedEvent>(
	events: readonly E[],
	cache?: MatchBuildCache<E>,
	{ unbacked = false }: { unbacked?: boolean } = {},
): BuiltMatch<E>[] {
	const sorted = events.toSorted((a, b) => a.t - b.t);
	const segmentation = GameSegments.split(sorted);
	const identities = GameIdentity.cluster(
		sorted
			.filter(isScoreboardEvent)
			.filter((board) => !segmentation.midGame.has(board)),
		segmentation.segments.map((segment) => segment.from),
	);

	const built: { from: number; built: BuiltMatch<E> }[] = [];
	for (const game of assignGames(segmentation, identities)) {
		if (!isBacked(game) && !(unbacked && game.kills.length > 0)) continue;
		built.push({ from: firstBaseT(game), built: builtGame(game, cache) });
	}
	return withRosterNames(
		built.sort((a, b) => a.from - b.from).map((entry) => entry.built),
	);
}

/** A game as assigned: its segment's reads (none for a board-only match), the screens shown after them and its closing board. */
interface Game<E extends DetectedEvent> {
	mapStart: GameSegments.Segment<E>["mapStart"];
	minimaps: GameSegments.Segment<E>["minimaps"];
	deaths: GameSegments.Segment<E>["deaths"];
	/** objective-counter reads; become the match's `objective` samples */
	objectives: GameSegments.Segment<E>["objectives"];
	/** icon-strip reads; become the match's `playerStatus` samples */
	playerStatuses: GameSegments.Segment<E>["playerStatuses"];
	/** sampled per-slot weapon evidence for the slot→row assignment */
	stripWeapons: GameSegments.Segment<E>["stripWeapons"];
	/** kill-feed stack reads; become the match's `kills` */
	kills: GameSegments.Segment<E>["kills"];
	/** X Battle lobby cards reporting on this game, shown before its closing board */
	xBattleCards: (E & XBattleCardEvent)[];
	/** the personal results screen, shown before the closing board */
	ownResults: OwnResultsEvent<E> | null;
	/** the results or history screen closing the game */
	scoreboard: (E & ScoreboardFamilyEvent) | null;
	/** a replay played back: its replay-browser entry shown again after it, which ends it */
	entryShownAgain: (E & ScoreboardFamilyEvent)[];
	/**
	 * per-stage read counts (a MapStart's stage seeds it); without an intro
	 * stage the plurality winner delimits same-vs-next map so one misread frame
	 * can't poison the match
	 */
	stageVotes: Map<StageId, number>;
	/** put on the built match without rebuilding it, and outside its time span */
	later: {
		/** the other boards of its identity: the game shown again */
		revisits: (E & ScoreboardFamilyEvent)[];
		/** shown after the closing board */
		xBattleCards: (E & XBattleCardEvent)[];
		/** the console clock's offset from the PC's (`consoleClockOffset`), taken off a recording time standing in for `playedAt` */
		consoleOffset: number;
	};
}

type OwnResultsEvent<E extends DetectedEvent> = E &
	EventOfType<typeof SCOREBOARD_OWN_EVENT_TYPE>;

/**
 * Which identity closes which segment, and where the other lobby screens go
 * (see `buildScannerMatches`). Returns every game: the segments' (discarded
 * no contests left out, unbacked ones in) and the board-only ones.
 */
function assignGames<E extends DetectedEvent>(
	{ segments, leading }: GameSegments.Segmentation<E>,
	identities: readonly GameIdentity.GameIdentity<E>[],
): Game<E>[] {
	const identityOf = new Map<E, GameIdentity.GameIdentity<E>>();
	for (const identity of identities) {
		for (const board of identity) identityOf.set(board, identity);
	}
	const historyBoards = [...identityOf.keys()]
		.filter(isHistoryScoreboardEvent)
		.sort((a, b) => a.t - b.t);
	const closed = new Map<GameIdentity.GameIdentity<E>, Game<E>>();
	const close = (
		game: Game<E>,
		board: E & ScoreboardFamilyEvent,
		identity: GameIdentity.GameIdentity<E>,
	): void => {
		game.scoreboard = board;
		GameSegments.vote(game.stageVotes, board.data.stage);
		closed.set(identity, game);
	};
	const looseCards: (E & XBattleCardEvent)[] =
		leading.filter(isXBattleCardEvent);
	const looseOwnResults: OwnResultsEvent<E>[] = leading.filter(
		(read): read is OwnResultsEvent<E> =>
			isEventOfType(read, SCOREBOARD_OWN_EVENT_TYPE),
	);

	const games = segments.map(gameOfSegment);
	const consoleOffset = consoleClockOffset(segments, games, identities);

	const segmentGames: { segment: GameSegments.Segment<E>; game: Game<E> }[] =
		[];
	for (const [index, segment] of segments.entries()) {
		const game = games[index]!;
		const replayed = replayedEntry(segment, historyBoards, identityOf, closed);
		const replayedIdentity = replayed ? identityOf.get(replayed)! : null;
		if (replayed) close(game, replayed, replayedIdentity!);

		let discarded = false;
		for (const read of segment.tail) {
			if (isScoreboardEvent(read)) {
				if (replayedIdentity && identityOf.get(read) === replayedIdentity) {
					game.entryShownAgain.push(read);
				}
				if (game.scoreboard || discarded) continue;
				if (read.data.noContest) {
					discarded = true;
					continue;
				}
				const identity = identityOf.get(read);
				if (
					identity &&
					closesSegment(read, identity, segment, game, closed, consoleOffset)
				) {
					close(game, read, identity);
				}
			} else if (isEventOfType(read, SCOREBOARD_OWN_EVENT_TYPE)) {
				if (discarded) continue;
				if (
					!game.scoreboard &&
					!game.ownResults &&
					ownResultsClaim(segment, read)
				) {
					game.ownResults = read;
					GameSegments.vote(game.stageVotes, read.data.stage);
				} else {
					looseOwnResults.push(read);
				}
			} else if (isXBattleCardEvent(read)) {
				if (discarded) looseCards.push(read);
				else if (!game.scoreboard) game.xBattleCards.push(read);
				else if (reportsOnClosed(game, read))
					game.later.xBattleCards.push(read);
				else looseCards.push(read);
			}
		}
		if (discarded) continue;
		withinClaimWindow(segment, game);
		segmentGames.push({ segment, game });
	}

	const boardGames: Game<E>[] = [];
	const unclosed = identities
		.filter((identity) => !closed.has(identity))
		.sort((a, b) => a[0]!.t - b[0]!.t);
	for (const identity of unclosed) {
		const shown = identity.find((board) => !isStagelessHistoryRead(board));
		if (!shown) continue;
		const missed = identity.every(isHistoryScoreboardEvent)
			? missedResultsGame(shown, segmentGames, consoleOffset)
			: undefined;
		if (missed) {
			close(missed, shown, identity);
			continue;
		}
		const game = emptyGame<E>();
		close(game, shown, identity);
		boardGames.push(game);
	}

	for (const [identity, game] of closed) {
		game.later.consoleOffset = consoleOffset;
		game.later.revisits = identity.filter(
			(board) =>
				board !== game.scoreboard && !game.entryShownAgain.includes(board),
		);
	}
	const assigned = [...segmentGames.map(({ game }) => game), ...boardGames];
	for (const own of looseOwnResults.sort((a, b) => a.t - b.t)) {
		const game = gameClosedAfter(
			assigned,
			own,
			segments,
			OWN_RESULTS_WINDOW_SECONDS,
		);
		if (game && !game.ownResults && ownResultsAgree(game.scoreboard!, own)) {
			game.ownResults = own;
		}
	}
	for (const card of looseCards.sort((a, b) => a.t - b.t)) {
		const previous = gameClosedBefore(assigned, card);
		if (previous && reportsOnClosed(previous, card)) {
			previous.later.xBattleCards.push(card);
			continue;
		}
		gameClosedAfter(
			assigned,
			card,
			segments,
			X_BATTLE_CARDS_WINDOW_SECONDS,
		)?.xBattleCards.push(card);
	}
	return assigned;
}

function gameOfSegment<E extends DetectedEvent>(
	segment: GameSegments.Segment<E>,
): Game<E> {
	return {
		...emptyGame<E>(),
		mapStart: segment.mapStart,
		minimaps: [...segment.minimaps],
		deaths: [...segment.deaths],
		objectives: [...segment.objectives],
		playerStatuses: [...segment.playerStatuses],
		stripWeapons: [...segment.stripWeapons],
		kills: [...segment.kills],
		stageVotes: new Map(segment.stageVotes),
	};
}

function emptyGame<E extends DetectedEvent>(): Game<E> {
	return {
		mapStart: null,
		minimaps: [],
		deaths: [],
		objectives: [],
		playerStatuses: [],
		stripWeapons: [],
		kills: [],
		xBattleCards: [],
		ownResults: null,
		scoreboard: null,
		entryShownAgain: [],
		stageVotes: new Map(),
		later: {
			revisits: [],
			xBattleCards: [],
			consoleOffset: 0,
		},
	};
}

/**
 * Whether a board in a segment's tail closes it: it shows a game no earlier
 * segment closed and none shown before this one was played (the battle log
 * browsed before playing), its stage was read, and the segment's own reads
 * don't contradict it.
 */
function closesSegment<E extends DetectedEvent>(
	board: E & ScoreboardFamilyEvent,
	identity: GameIdentity.GameIdentity<E>,
	segment: GameSegments.Segment<E>,
	game: Game<E>,
	closed: ReadonlyMap<GameIdentity.GameIdentity<E>, Game<E>>,
	consoleOffset: number,
): boolean {
	if (closed.has(identity) || isStagelessHistoryRead(board)) return false;
	if (identity[0]!.t < segment.from) return false;
	return !isHistoryOfAnotherGame(board, game, consoleOffset);
}

/**
 * The replay-browser entry a segment plays back: the last history screen
 * before its intro was that entry, shown at most `REPLAY_LOAD_MAX_SECONDS`
 * earlier, its game closes no segment yet, and the intro's stage (or with
 * that unread, its mode) agrees with it. Returns the entry's game's first
 * board with its stage read.
 */
function replayedEntry<E extends DetectedEvent>(
	segment: GameSegments.Segment<E>,
	historyBoards: readonly (E & ScoreboardFamilyEvent)[],
	identityOf: ReadonlyMap<E, GameIdentity.GameIdentity<E>>,
	closed: ReadonlyMap<GameIdentity.GameIdentity<E>, Game<E>>,
): (E & ScoreboardFamilyEvent) | null {
	const intro = segment.mapStart;
	if (!intro) return null;
	const entry = historyBoards.findLast((shown) => shown.t < intro.t);
	if (
		entry?.type !== SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE ||
		intro.t - entry.t > REPLAY_LOAD_MAX_SECONDS
	) {
		return null;
	}
	const identity = identityOf.get(entry);
	if (
		!identity ||
		closed.has(identity) ||
		!identity.every(isHistoryScoreboardEvent)
	) {
		return null;
	}
	const board = identity.find((read) => !isStagelessHistoryRead(read));
	if (!board) return null;

	const { stage, mode } = intro.data;
	if (mode !== null && board.data.mode !== null && mode !== board.data.mode) {
		return null;
	}
	const agrees =
		stage !== null
			? stage === board.data.stage
			: mode !== null && mode === board.data.mode;
	return agrees ? board : null;
}

/**
 * Whether a personal results screen shown before any board closed the segment
 * joins it: a game with an intro or a minimap read takes it, one with neither
 * only when counter reads show it was played.
 */
function ownResultsClaim<E extends DetectedEvent>(
	segment: GameSegments.Segment<E>,
	own: E,
): boolean {
	if (segment.mapStart || segment.minimaps.length > 0) return true;
	return segment.objectives.some(
		(read) => own.t - read.t <= FALLBACK_WINDOW_SECONDS,
	);
}

/**
 * A game with neither an intro nor a minimap read keeps only the gameplay read
 * within `FALLBACK_WINDOW_SECONDS` of the screen that claimed it (the
 * personal results or the closing board).
 */
function withinClaimWindow<E extends DetectedEvent>(
	segment: GameSegments.Segment<E>,
	game: Game<E>,
): void {
	if (segment.mapStart || segment.minimaps.length > 0) return;
	const claimedAt = game.ownResults?.t ?? game.scoreboard?.t;
	if (claimedAt === undefined) return;
	const within = (read: DetectedEvent) =>
		claimedAt - read.t <= FALLBACK_WINDOW_SECONDS;
	game.deaths = game.deaths.filter(within);
	game.objectives = game.objectives.filter(within);
	game.playerStatuses = game.playerStatuses.filter(within);
	game.stripWeapons = game.stripWeapons.filter(within);
	game.kills = game.kills.filter(within);
}

/**
 * Whether a personal results screen no game being gathered took can be the
 * game `board` closes: no lobby, mode, stage or POV weapon both read and
 * different.
 */
function ownResultsAgree<E extends DetectedEvent>(
	board: E & ScoreboardFamilyEvent,
	own: OwnResultsEvent<E>,
): boolean {
	const differs = <T>(a: T | null, b: T | null) =>
		a !== null && b !== null && a !== b;
	const povWeapon =
		board.data.povIndex === null
			? null
			: (board.data.players[board.data.povIndex]?.weaponId ?? null);
	return !(
		differs(board.data.lobby, own.data.lobby) ||
		differs(board.data.mode, own.data.mode) ||
		differs(board.data.stage, own.data.stage) ||
		differs(povWeapon, own.data.weaponId)
	);
}

/**
 * Whether an X Battle lobby card shown after a game's closing board reports on
 * it: seen soon after, the game an X Battle (or of unread lobby), not a
 * history screen browsed.
 */
function reportsOnClosed<E extends DetectedEvent>(
	game: Game<E>,
	card: E,
): boolean {
	const board = game.scoreboard;
	if (!board || isHistoryOnly({ sources: gameInputs(game) })) return false;
	const lobby = board.data.lobby ?? game.ownResults?.data.lobby ?? null;
	if (lobby !== null && lobby !== "X") return false;
	const since = card.t - lastBaseT(game);
	return since >= 0 && since <= X_BATTLE_CARDS_WINDOW_SECONDS;
}

/** The game whose closing board came last before the card. */
function gameClosedBefore<E extends DetectedEvent>(
	games: readonly Game<E>[],
	card: E,
): Game<E> | undefined {
	let found: Game<E> | undefined;
	for (const game of games) {
		const t = game.scoreboard?.t;
		if (t === undefined || t > card.t) continue;
		if (!found || t > found.scoreboard!.t) found = game;
	}
	return found;
}

/**
 * The game whose closing board comes first after a lobby screen that joined
 * no game, within `windowSeconds` and with no gameplay between them.
 */
function gameClosedAfter<E extends DetectedEvent>(
	games: readonly Game<E>[],
	read: E,
	segments: readonly GameSegments.Segment<E>[],
	windowSeconds: number,
): Game<E> | undefined {
	let found: Game<E> | undefined;
	for (const game of games) {
		const t = game.scoreboard?.t;
		if (t === undefined || t <= read.t) continue;
		if (t - read.t > windowSeconds) continue;
		if (
			segments.some((segment) => segment.from > read.t && segment.from <= t)
		) {
			continue;
		}
		if (!found || t < found.scoreboard!.t) found = game;
	}
	return found;
}

/** When the first read a game is built from was seen: the matches' order. */
function firstBaseT<E extends DetectedEvent>(game: Game<E>): number {
	return Math.min(...gameInputs(game).map((event) => event.t));
}

/** When the last read a game is built from was seen. */
function lastBaseT<E extends DetectedEvent>(game: Game<E>): number {
	return Math.max(...gameInputs(game).map((event) => event.t));
}

/** The match as built from its game, cached, with what joined it later put on top. */
function builtGame<E extends DetectedEvent>(
	game: Game<E>,
	cache: MatchBuildCache<E> | undefined,
): BuiltMatch<E> {
	const built = cachedBuiltMatch(game, cache);
	const { revisits, xBattleCards, consoleOffset } = game.later;
	const recorded = game.scoreboard
		? GameIdentity.recordedAt(game.scoreboard)
		: null;
	const onPcClock = recorded !== null && consoleOffset !== 0;
	if (revisits.length === 0 && xBattleCards.length === 0 && !onPcClock) {
		return built;
	}
	let match = built.match;
	if (onPcClock) match = { ...match, playedAt: recorded - consoleOffset };
	for (const board of revisits) {
		match = withRevealedNames(match, built.sources, board);
	}
	if (xBattleCards.length > 0) match = { ...match, lobby: match.lobby ?? "X" };
	return {
		...built,
		match,
		sources: [...built.sources, ...revisits, ...xBattleCards].sort(
			(a, b) => a.t - b.t,
		),
	};
}

/**
 * The matches with their player names voted on across the session
 * (name-roster.ts): a name the other games of its team read otherwise takes
 * their spelling. Unbacked matches read no names and take no part.
 */
function withRosterNames<E extends DetectedEvent>(
	built: BuiltMatch<E>[],
): BuiltMatch<E>[] {
	const backed = built.filter((entry) => !entry.unbacked);
	const snapped = NameRoster.snapNames(
		backed.map(({ match }) =>
			match.teams.map((team) => team.players.map((player) => player.name)),
		),
	);
	const renamed = new Map(
		backed.map((entry, i) => [entry, withNames(entry.match, snapped[i]!)]),
	);
	return built.map((entry) => {
		const match = renamed.get(entry);
		return match && match !== entry.match ? { ...entry, match } : entry;
	});
}

/** The match with its players' names, per team; the match itself when none changed. */
function withNames(
	match: ScannerMatch,
	names: readonly (readonly (string | null)[])[],
): ScannerMatch {
	let changed = false;
	const teams = match.teams.map((team, side) => ({
		...team,
		players: team.players.map((player, slot) => {
			const name = names[side]![slot]!;
			if (name === player.name) return player;
			changed = true;
			return { ...player, name };
		}),
	})) as ScannerMatch["teams"];
	return changed ? { ...match, teams } : match;
}

function withOwnBuildOn(
	teams: ScannerMatch["teams"],
	pov: { team: 0 | 1; index: number } | null,
	own: ScoreboardOwnData | undefined,
): ScannerMatch["teams"] {
	return own && pov ? withOwnBuild(teams, pov, own) : teams;
}

/**
 * The POV row with the personal results screen's build (a gear card a
 * streamer's overlay covered keeps what the row had) and, when the row's
 * weapon is unread, its weapon.
 */
function withOwnBuild(
	teams: ScannerMatch["teams"],
	pov: { team: 0 | 1; index: number },
	own: ScoreboardOwnData,
): ScannerMatch["teams"] {
	const team = teams[pov.team];
	const player = team.players[pov.index];
	if (!player) return teams;
	const abilities =
		own.abilities.length === 0
			? player.abilities
			: own.abilities.map((row, slot) =>
					row.every((ability) => ability === "UNKNOWN") &&
					player.abilities?.[slot]
						? player.abilities[slot]!
						: row,
				);
	const result = [...teams] as ScannerMatch["teams"];
	result[pov.team] = {
		...team,
		players: team.players.with(pov.index, {
			...player,
			weaponId: player.weaponId ?? own.weaponId,
			...(abilities ? { abilities } : null),
		}),
	};
	return result;
}

/** Why a built match is held back from /ingest; absent = it is sent. */
export type IngestSkipReason =
	/** not a Private Battle or X Battle game */
	| "lobby"
	/** a disconnect ended it before it could be decided */
	| "disconnect"
	/** built off gameplay alone: no scoreboard or minimap read a player */
	| "noPlayers";

/**
 * Which built matches are not worth sending to /ingest, and why: lobbies other
 * than Private and X Battle (unread lobbies get the benefit of the doubt), games
 * with no player read (nothing to link or merge them by), and games a disconnect
 * cut short — counter reads show the game couldn't have ended on its own
 * (`endedEarly`), or with no counter read to tell, a results screen came
 * before the clock could run out and the same map/mode was replayed right
 * after with a score.
 * Replay evidence only arrives after the fact, so a live scan may already have
 * sent the abandoned game; the counter-read check catches it in the moment.
 */
export function ingestSkipReasons<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
): Map<BuiltMatch<E>, IngestSkipReason> {
	const reasons = new Map<BuiltMatch<E>, IngestSkipReason>();
	for (const [index, candidate] of built.entries()) {
		const { match } = candidate;
		if (!isUploadedLobby(match.lobby)) {
			reasons.set(candidate, "lobby");
		} else if (match.teams.every((team) => team.players.length === 0)) {
			reasons.set(candidate, "noPlayers");
		} else if (
			isScoreless(match) &&
			(endedEarly(match) || wasReplayed(built, index))
		) {
			reasons.set(candidate, "disconnect");
		}
	}
	return reasons;
}

/**
 * Whether a match was built off battle history screens alone (a battle log or
 * replay browser entry browsed later): it holds no read of the game being played.
 */
export function isHistoryOnly(built: {
	sources: readonly DetectedEvent[];
}): boolean {
	return built.sources.every((event) => isHistoryScoreboardEvent(event));
}

/**
 * Objective-counter reads on a match whose detected mode rules their overlay
 * out (every read on Turf War) — lookalike misreads the builder already left
 * out of the match's `objective`. Callers should delete these from their
 * stores. A match with no mode read yet loses nothing: its minority overlay is
 * only left out of the build.
 */
export function invalidObjectiveEvents<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
): E[] {
	return built.flatMap(({ match, sources }) => {
		if (match.mode === null) return [];
		const kind = matchCounterKind(match.mode, []);
		return sources.filter(
			(event) =>
				isEventOfType(event, OBJECTIVE_EVENT_TYPE) &&
				counterKindOfRead(event.data) !== kind,
		);
	});
}

/** `events` without the objective reads their matches' modes rule out (`invalidObjectiveEvents`): what a finished scan keeps. */
export function withoutInvalidObjectives<E extends DetectedEvent>(
	events: E[],
): E[] {
	const invalid = new Set(invalidObjectiveEvents(buildScannerMatches(events)));
	return invalid.size > 0 ? events.filter((e) => !invalid.has(e)) : events;
}

type CounterKind = "zones" | "track";

/**
 * Which counter overlay the match's reads should come from: the one its mode
 * draws, or with the mode unknown whichever kind most reads saw (the other is
 * a lookalike). Null = a mode with no parsed overlay, or no reads.
 */
function matchCounterKind(
	mode: ModeShort | null,
	reads: readonly ObjectiveData[],
): CounterKind | null {
	if (mode === "SZ" || mode === "CB") return "zones";
	if (mode === "TC" || mode === "RM") return "track";
	if (mode !== null) return null;
	const trackReads = reads.filter(
		(read) => counterKindOfRead(read) === "track",
	).length;
	if (reads.length === 0) return null;
	return trackReads * 2 > reads.length ? "track" : "zones";
}

function counterKindOfRead(data: ObjectiveData): CounterKind {
	return data.mode === "SZ" ? "zones" : "track";
}

/**
 * The objective's mode: the match's when known, else what most track reads'
 * checkpoint markers showed; null when a track match's markers never read or
 * a plates match's mode is unknown (SZ and CB draw the same plates).
 */
function objectiveMode(
	kind: CounterKind,
	mode: ModeShort | null,
	reads: readonly ObjectiveData[],
): ScannerMatchObjective["mode"] {
	if (kind === "zones") return mode === "SZ" || mode === "CB" ? mode : null;
	if (mode === "TC" || mode === "RM") return mode;
	const votes = { TC: 0, RM: 0 };
	for (const read of reads) {
		if (read.mode === "TC" || read.mode === "RM") votes[read.mode]++;
	}
	if (votes.TC === votes.RM) return null;
	return votes.TC > votes.RM ? "TC" : "RM";
}

/** A results screen was read but its score banner wasn't: a disconnect, or a misread. */
function isScoreless(match: ScannerMatch): boolean {
	// no results screen at all: an unfinished scan, not an unfinished game
	return match.winner !== null && match.matchScores === null;
}

/**
 * A disconnect ended the match before it was decided: the last counter read
 * still needed more game than the footage gave it — a game ends no sooner than
 * the clock running out or (SZ) the lower counter falling to zero at its 1/s
 * cap (penalty worked off first).
 */
function endedEarly(match: ScannerMatch): boolean {
	const shortfall = counterShortfallSeconds(match);
	return shortfall !== null && shortfall > EARLY_END_MARGIN_SECONDS;
}

/**
 * How much more game the last counter read needed than the footage gave it;
 * null when no counter read bounds the game's end.
 */
function counterShortfallSeconds(match: ScannerMatch): number | null {
	const lastSample = match.objective?.samples.at(-1);
	if (!lastSample || match.endsAt === null) return null;

	const soonestEnd = secondsUntilSoonestEnd(
		lastSample,
		match.objective?.mode === "SZ",
	);
	if (soonestEnd === null) return null;

	const secondsLeftInFootage = match.endsAt - lastSample.t;
	return soonestEnd - secondsLeftInFootage;
}

/** Only SZ's count ticks at a known rate (1/s), so only it bounds a knockout. */
function secondsUntilSoonestEnd(
	sample: ScannerMatchObjectiveSample,
	countsSeconds: boolean,
): number | null {
	const knockouts = countsSeconds
		? sample.score.map((score, team) =>
				score === null ? null : score + (sample.penalty[team] ?? 0),
			)
		: [];
	const seconds = [sample.time, ...knockouts].filter(
		(value): value is number => value !== null,
	);
	return seconds.length > 0 ? Math.min(...seconds) : null;
}

/**
 * Whether the scoreless match at `index` was played again right after: the
 * following games on the same mode and stage are the same game restarted, so
 * one of them reaching a score means the earlier attempts were disconnects.
 * The run stops at the first other map; battle history views of other games
 * are no games played and don't count. Only a match the results screen came
 * before the clock could run out qualifies — otherwise a misread banner would
 * drop a real game whenever the next one shares its map (X Battle rotations).
 */
function wasReplayed<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
	index: number,
): boolean {
	const { match, sources } = built[index]!;
	if (match.mode === null || match.stage === null) return false;
	// a counter read bounding the game's end settles it alone (`endedEarly`)
	if (counterShortfallSeconds(match) !== null) return false;
	if (!endedBeforeClock(match, sources)) return false;

	for (const later of built.slice(index + 1)) {
		if (!isPlayedGame(later.sources)) continue;
		if (later.match.mode !== match.mode || later.match.stage !== match.stage) {
			return false;
		}
		if (later.match.matchScores !== null) return true;
	}
	return false;
}

/** The results screen came sooner after the intro than the mode's clock runs. */
function endedBeforeClock(
	match: ScannerMatch,
	sources: readonly DetectedEvent[],
): boolean {
	const intro = sources.find((event) => event.type === MAP_START_EVENT_TYPE);
	if (!intro || match.endsAt === null) return false;
	return match.endsAt - intro.t < clockSecondsOf(match.mode);
}

function isPlayedGame(sources: readonly DetectedEvent[]): boolean {
	return sources.some((event) => !isHistoryScoreboardEvent(event));
}

function isBacked<E extends DetectedEvent>(game: Game<E>): boolean {
	return (
		game.scoreboard !== null ||
		game.ownResults !== null ||
		game.minimaps.length > 0 ||
		hasPlayedCounter(game)
	);
}

/** An intro followed by counter reads spanning a stretch of game clock: the game was played, results screen or not. */
function hasPlayedCounter<E extends DetectedEvent>(game: Game<E>): boolean {
	const first = game.objectives[0];
	const last = game.objectives.at(-1);
	return (
		game.mapStart !== null &&
		first !== undefined &&
		last!.t - first.t >= MIN_PLAYED_COUNTER_SECONDS
	);
}

/** The events a game's match is built from in a fixed order; equal lists mean the same match. */
function gameInputs<E extends DetectedEvent>(game: Game<E>): E[] {
	return [
		...(game.mapStart ? [game.mapStart] : []),
		...game.minimaps,
		...game.deaths,
		...game.objectives,
		...game.playerStatuses,
		...game.stripWeapons,
		...game.kills,
		...game.xBattleCards,
		...(game.ownResults ? [game.ownResults] : []),
		...(game.scoreboard ? [game.scoreboard] : []),
		...game.entryShownAgain,
	];
}

function cachedBuiltMatch<E extends DetectedEvent>(
	game: Game<E>,
	cache: MatchBuildCache<E> | undefined,
): BuiltMatch<E> {
	if (!cache) return toBuiltMatch(game);
	const inputs = gameInputs(game);
	const cacheKey = game.scoreboard ?? inputs[0]!;
	const cached = cache.get(cacheKey);
	if (
		cached &&
		cached.inputs.length === inputs.length &&
		cached.inputs.every((event, index) => event === inputs[index])
	) {
		return cached.built;
	}
	const built = toBuiltMatch(game);
	cache.set(cacheKey, { inputs, built });
	return built;
}

function toBuiltMatch<E extends DetectedEvent>(open: Game<E>): BuiltMatch<E> {
	const sources = gameInputs(open).sort((a, b) => a.t - b.t);

	const board: ScoreboardData | undefined = open.scoreboard?.data;
	const start = open.mapStart?.data;
	const own = open.ownResults?.data;
	const deaths = open.deaths.map((event) => event.data);
	const objectives = open.objectives.map(({ t, data }) => ({ t, data }));
	const playerStatuses = open.playerStatuses.map(({ t, data }) => ({
		t,
		data,
	}));
	const stripWeapons = open.stripWeapons.map(({ t, data }) => ({ t, data }));
	const minimapReads = open.minimaps.map(({ t, data }) => ({ t, data }));
	const killReads = open.kills.map(({ t, data }) => ({ t, data }));
	const minimaps = minimapReads.map((read) => read.data);
	// without a results screen the minimap's own card is the POV's row, and
	// its personal results' weapon seats it before the strip evidence does
	const selfIndex = board ? null : minimapSelfIndex(minimaps);
	const minimapTeams = board
		? null
		: withOwnBuildOn(
				teamsFromMinimaps(bestScoredFirst(open.minimaps), deaths),
				selfIndex === null ? null : { team: 0, index: selfIndex },
				own,
			);

	const mode = matchMode(board?.mode ?? own?.mode ?? null, start?.mode ?? null);
	// reads of the overlay the mode doesn't draw are lookalike misreads; the
	// icon strip, minimap card states and the kill feed are drawn in every mode
	const counterKind = matchCounterKind(
		mode,
		objectives.map((read) => read.data),
	);
	const counterReads = objectives.filter(
		(read) => counterKindOfRead(read.data) === counterKind,
	);
	const minimapColors = minimapTeamColors(minimaps);
	const progress = buildProgress(
		counterReads,
		counterKind === null
			? null
			: objectiveMode(
					counterKind,
					mode,
					counterReads.map((read) => read.data),
				),
		playerStatuses,
		stripWeapons,
		minimapReads,
		killReads,
		board,
		minimapColors,
		open.deaths.map((event) => event.t),
		clockSecondsOf(mode),
		minimapTeams?.every((team) => team.players.length === PLAYERS_PER_TEAM)
			? {
					rows: [...minimapTeams[0].players, ...minimapTeams[1].players],
					povIndex: minimapSelfIndex(minimaps),
				}
			: null,
	);

	const pov: ScannerMatch["pov"] =
		board && board.povIndex !== null
			? {
					team: board.povIndex < PLAYERS_PER_TEAM ? 0 : 1,
					index: board.povIndex % PLAYERS_PER_TEAM,
				}
			: null;

	const match: ScannerMatch = {
		startsAt:
			sources.length > 0 ? Math.max(0, Math.floor(sources[0]!.t)) : null,
		endsAt: floorOrNull(sources.at(-1)?.t),
		playedAt: open.scoreboard ? GameIdentity.playedAt(open.scoreboard) : null,
		// only X Battle shows its lobby cards: they tell a game whose results
		// screen was missed (or its header unread) apart from other lobbies
		lobby:
			board?.lobby ?? own?.lobby ?? (open.xBattleCards.length > 0 ? "X" : null),
		mode,
		stage:
			board?.stage ??
			start?.stage ??
			own?.stage ??
			GameSegments.leadingStage(open.stageVotes),
		matchScores: board?.matchScores.some((score) => score !== null)
			? board.matchScores
			: null,
		replayCode: GameIdentity.historyData(open.scoreboard)?.replayCode ?? null,
		// layout alone cannot flag a broadcast (S3 POV footage draws both narrow
		// strip geometries), so only the spectator map screen or badge-proven
		// strips count; a results screen that identified the POV seat disproves
		// them all — casts never see one
		cast:
			pov === null &&
			(open.minimaps.some((event) => event.data.spectator) ||
				playerStatuses.some((read) => read.data.cast)),
		objective: progress.objective,
		playerStatus: progress.playerStatus,
		kills: progress.kills,
		teams: board
			? withOwnBuildOn(
					teamsFromScoreboard(
						board,
						deaths,
						minimaps,
						progress.minimapEnemySide,
					),
					pov,
					own,
				)
			: withRowWeapons(minimapTeams!, progress.rowWeapons),
		winner: board ? 0 : null,
		pov,
	};

	const inks = teamInks(minimapColors, board ? progress.minimapEnemySide : 0);

	return isBacked(open)
		? { match, sources, inks }
		: { match, sources, unbacked: true, inks };
}

/** The minimap's own and enemy ink in `teams` order, by the side the enemy column is (null: not known). */
function teamInks(
	minimapColors: [InkRgb | null, InkRgb | null] | null,
	enemySide: 0 | 1 | null,
): BuiltMatch<DetectedEvent>["inks"] {
	if (!minimapColors || enemySide === null) return null;

	const [own, enemy] = minimapColors;
	return enemySide === 1 ? [own, enemy] : [enemy, own];
}

/**
 * The mode the intro and results screen agree on; a disagreement means one of
 * them misread, so the mode is unknown rather than letting a misread rule out
 * the real overlay's reads.
 */
function matchMode(
	boardMode: ModeShort | null,
	startMode: ModeShort | null,
): ModeShort | null {
	if (boardMode !== null && startMode !== null && boardMode !== startMode) {
		return null;
	}
	return boardMode ?? startMode;
}

function floorOrNull(t: number | undefined): number | null {
	return t === undefined ? null : Math.max(0, Math.floor(t));
}

/**
 * The counter reads as `objective` samples and the icon-strip reads as
 * `playerStatus` samples, both in `teams` order. POV footage keeps the POV
 * side on the left plate, but casted footage reorders the plates to follow
 * the specced player — so each counter read is first oriented by its sides'
 * ink hues (clustered against the first read that saw both); a status read
 * carries no ink and inherits the orientation of the nearest counter read in
 * time (same frames). Broadcast replay wipes re-run an earlier moment with the
 * HUD intact, so every series is tracked on one game clock (core/clock.ts)
 * and reads on a moment shown again are dropped; timerless reads follow the
 * clock span they fall in. A displayed count
 * never increases, so each side keeps only its longest non-increasing score
 * run (blips voided, not charted). Then into `teams` order: scoreboard-closed
 * is winner-first (POV seat when read; else in SZ the side whose count went
 * furthest down), minimap-grouped anchors on the minimap's own-vs-enemy ink
 * colors, no signal keeps the first read's arrangement. Slots keep their
 * on-screen left-to-right order through a side swap (whether the game mirrors
 * slot order across sides is unattested).
 *
 * Minimap reads contribute status samples too (card cross-out and camo
 * states), interleaved on the same replay-wipe anchor. Their sides are
 * own/enemy — camera-stable — so they skip cluster orientation and map to
 * `teams` through the match's minimap ink anchor.
 *
 * Within a side the strip keeps its own slot order (it can change every
 * game) while a results scoreboard re-sorts rows, so on a scoreboard-closed
 * match each side's slots are reordered into row order once per game from
 * the identity evidence in slot-row-assignment.ts: StripWeapons votes, the
 * minimap's card columns (mirror the strip seating; attested for the enemy
 * column, own column assumed symmetric), and the strip states of players
 * known by name (the POV's death screens, its kill-feed victims, named POV
 * minimap cards). The POV diamond follows neither order, so its flags map by
 * card name and stay as drawn when too few names resolve. A minimap-grouped
 * match's samples stay as drawn by construction.
 *
 * Kill-feed stack reads share the replay-wipe anchor (they carry the same
 * clock) and reduce to one kill per row entering a stack (deriveKills); the
 * feed belongs to the POV (on a cast: specced) player, so they need no side
 * orientation.
 */
function buildProgress(
	objectives: readonly { t: number; data: ObjectiveData }[],
	mode: ScannerMatchObjective["mode"],
	playerStatuses: readonly { t: number; data: PlayerStatusData }[],
	stripWeapons: readonly { t: number; data: StripWeaponsData }[],
	minimapReads: readonly { t: number; data: MinimapData }[],
	killReads: readonly { t: number; data: KillData }[],
	board: ScoreboardData | undefined,
	minimapColors: [InkRgb | null, InkRgb | null] | null,
	deathTimes: readonly number[],
	clockSeconds: number,
	minimapRows: { rows: SlotRowInputs["rows"]; povIndex: number | null } | null,
): {
	objective: ScannerMatchObjective | null;
	playerStatus: ScannerMatchPlayerStatus | null;
	kills: ScannerMatchKill[] | null;
	/** a minimap-grouped match's row weapons, unread cards filled off the strip (stripFilledRowWeapons) */
	rowWeapons: (MainWeaponId | null)[] | null;
	/** the `teams` side the minimap's enemy column is; null with no scoreboard */
	minimapEnemySide: 0 | 1 | null;
} {
	const clock = Clock.track(
		[...objectives, ...playerStatuses, ...killReads].map((read) => ({
			t: read.t,
			time: read.data.time,
		})),
	);
	const live = onLiveClock(objectives, clock);
	const liveKills = onLiveClock(killReads, clock);
	const statusReads = [
		...playerStatuses.map(
			(read): StatusRead => ({
				t: read.t,
				fromMinimap: false,
				data: read.data,
			}),
		),
		...minimapStatusReads(minimapReads),
	].sort((a, b) => a.t - b.t);
	const liveStatuses = onLiveClock(statusReads, clock);

	const clusterHues = seedClusterHues(live);
	const swapFlags = readSwapFlags(live, clusterHues);
	const oriented = withMonotonicScores(orientObjectives(live, swapFlags));

	const swap = board
		? board.povIndex !== null
			? board.povIndex >= PLAYERS_PER_TEAM
			: bestCount(oriented, 1) < bestCount(oriented, 0)
		: minimapAnchorSwap(clusterHues, minimapColors);
	const minimapSwapped = swap !== minimapAnchorSwap(clusterHues, minimapColors);

	const kills = liveKills.length === 0 ? null : deriveKills(liveKills);
	const slotRowInputs = (
		rows: SlotRowInputs["rows"],
		povIndex: number | null,
	): SlotRowInputs => ({
		rows,
		povIndex,
		playerStatuses: onLiveClock(playerStatuses, clock),
		stripWeapons,
		minimapReads,
		kills: kills ?? [],
		deathTimes,
		live,
		swapFlags,
		swap,
		minimapSwapped,
	});
	const perms = board
		? slotRowPermutations(slotRowInputs(board.players, board.povIndex))
		: null;
	const rowWeapons =
		!board && minimapRows
			? stripFilledRowWeapons(
					slotRowInputs(minimapRows.rows, minimapRows.povIndex),
				)
			: null;

	const objective =
		oriented.length === 0
			? null
			: {
					mode,
					samples: oriented.map((read): ScannerMatchObjectiveSample => {
						const [a, b] = swap ? ([1, 0] as const) : ([0, 1] as const);
						return {
							t: Math.max(0, Math.floor(read.t)),
							time: read.time,
							score: [read.score[a], read.score[b]],
							penalty: [read.penalty[a], read.penalty[b]],
							control: swap ? flippedSide(read.control) : read.control,
							...(read.position !== undefined
								? {
										position: swap
											? flippedPosition(read.position)
											: read.position,
									}
								: null),
						};
					}),
				};

	const playerStatus =
		liveStatuses.length === 0
			? null
			: {
					samples: decodedSamples(
						liveStatuses.map((read) => {
							const swapped = read.fromMinimap
								? minimapSwapped
								: nearestSwapFlag(live, swapFlags, read.t) !== swap;
							const [a, b] = swapped ? ([1, 0] as const) : ([0, 1] as const);
							const time =
								read.data.time ??
								Clock.position(clock, { t: read.t, time: null }).remaining;
							return {
								t: read.t,
								time: read.data.time,
								elapsed: time === null ? null : clockSeconds - time,
								slots: [a, b].map((source, side) =>
									applyPermutation(
										read.data.slots[source]!,
										readPermutation(perms, read, source, side as 0 | 1),
									),
								) as [ReadSide, ReadSide],
							};
						}),
					),
				};

	return {
		objective,
		playerStatus,
		kills,
		minimapEnemySide: board ? (minimapSwapped ? 0 : 1) : null,
		rowWeapons,
	};
}

/**
 * One kill per feed row entering the feed. Rows expire oldest-first and a
 * single read can miss an inner row (a blurred pill ends the bottom-up scan
 * early), so each read is aligned as a subsequence of the rows still
 * remembered (first seen within KILL_ROW_LIFETIME_SECONDS): a row matching a
 * remembered one is carried, anything else is a new kill. An unreadable
 * (null) row matches any name, but the alignment carries as many named
 * matches as it can, so a row sliding in unread never takes a named row's
 * place; a carried unread row takes the name it is later read with, kill
 * included. Remembered rows a read fails to show stay remembered until they
 * age out, so the recovered read after a truncated one re-counts nothing.
 */
function deriveKills(
	reads: readonly { t: number; data: KillData }[],
): ScannerMatchKill[] {
	const kills: ScannerMatchKill[] = [];
	// rows believed on screen, oldest first, by the read that first saw them
	let known: { name: string | null; t: number; kill: ScannerMatchKill }[] = [];
	for (const read of reads) {
		known = known.filter((row) => read.t - row.t <= KILL_ROW_LIFETIME_SECONDS);
		const names = read.data.names.toReversed();
		const matched = alignKillRows(
			known.map((row) => row.name),
			names,
		);

		// rebuild the remembered stack in order: unmatched remembered rows stay
		// (hidden or expiring), unmatched read rows are new kills
		const t = Math.max(0, Math.floor(read.t));
		const next: typeof known = [];
		let placed = 0;
		const placeNewUpTo = (end: number): void => {
			for (; placed < end; placed++) {
				const name = names[placed]!;
				const kill = { t, time: read.data.time, name };
				kills.push(kill);
				next.push({ name, t: read.t, kill });
			}
		};
		for (const [k, row] of known.entries()) {
			const i = matched.get(k);
			if (i === undefined) {
				next.push(row);
				continue;
			}
			placeNewUpTo(i);
			const name = names[i]!;
			if (row.name === null && name !== null) {
				row.kill.name = name;
				next.push({ ...row, name });
			} else {
				next.push(row);
			}
			placed = i + 1;
		}
		placeNewUpTo(names.length);
		known = next;
	}
	// earliest first: the stack walk already emits in feed order, the sort
	// pins it as the contract
	return kills.toSorted((a, b) => a.t - b.t);
}

/**
 * The order-preserving pairing of remembered rows with read rows (both oldest
 * first) that carries the most rows, named matches outweighing two unread
 * ones; ties go to the newest remembered rows, which expire last. Maps
 * remembered index → read index.
 */
function alignKillRows(
	known: readonly (string | null)[],
	read: readonly (string | null)[],
): Map<number, number> {
	const weightOf = (knownIndex: number, readIndex: number): number => {
		const a = known[knownIndex]!;
		const b = read[readIndex]!;
		if (a === null || b === null) return 1;
		return sameRowName(a, b) ? 3 : 0;
	};
	// best[k][i]: the heaviest alignment of known[0..k) with read[0..i)
	const best = Array.from({ length: known.length + 1 }, () =>
		new Array<number>(read.length + 1).fill(0),
	);
	for (let k = 1; k <= known.length; k++) {
		for (let i = 1; i <= read.length; i++) {
			const weight = weightOf(k - 1, i - 1);
			best[k]![i] = Math.max(
				best[k - 1]![i]!,
				best[k]![i - 1]!,
				weight > 0 ? best[k - 1]![i - 1]! + weight : 0,
			);
		}
	}

	const matched = new Map<number, number>();
	let k = known.length;
	let i = read.length;
	while (k > 0 && i > 0) {
		const weight = weightOf(k - 1, i - 1);
		if (weight > 0 && best[k]![i] === best[k - 1]![i - 1]! + weight) {
			matched.set(k - 1, i - 1);
			k--;
			i--;
		} else if (best[k]![i] === best[k - 1]![i]) {
			k--;
		} else {
			i--;
		}
	}
	return matched;
}

function sameRowName(a: string, b: string): boolean {
	return nameSimilarity(a, b) >= KILL_SAME_ROW_MIN_SIMILARITY;
}

/** The slot→row permutations of a scoreboard-closed match, per source. */
interface SlotRowPerms {
	/** per teams side, for strip-seated slots (the strip and card columns) */
	strip: [SlotRowPermutation, SlotRowPermutation];
	/** for the POV diamond's teammate flags; null = keep as drawn */
	diamond: SlotRowPermutation | null;
}

/**
 * One minimap card's parsed weapon next to strip votes (a read's score over its
 * candidate floor, ~0.1-0.4): the card parser is gated on a clean read, so one
 * card outweighs a few strip samples without drowning a match's worth of them.
 */
const MINIMAP_CARD_VOTE = 1;

/** A kill-feed row comes up with the splat, the victim's strip cross-out a beat later (s). */
const KILL_STRIP_DELAY_SECONDS = 1;

/**
 * A strip slot's summed votes must reach this to name an unread row's weapon
 * (a handful of reads; a game's worth runs 10+), and lead the best other
 * weapon by this factor: siblings split a slot's votes, a near split names
 * neither.
 */
const MIN_STRIP_FILL_VOTE = 1;
const STRIP_FILL_LEAD = 1.5;
/**
 * Two kits of one weapon both score high on every read (they share the
 * render), so summed votes barely separate them. The kit the slot ranks first
 * on at least this share of the reads ranking both is named; a closer split
 * names the base weapon.
 */
const KIT_HEAD_TO_HEAD_SHARE = 0.75;

/** What slotRowEvidence reads: the match's sources plus the rows (scoreboard or minimap) they are matched to. */
interface SlotRowInputs {
	/** both teams' rows, `teams` order */
	rows: readonly { name: string | null; weaponId: MainWeaponId | null }[];
	/** the POV's row index into `rows`, null when unknown */
	povIndex: number | null;
	playerStatuses: readonly { t: number; data: PlayerStatusData }[];
	stripWeapons: readonly { t: number; data: StripWeaponsData }[];
	minimapReads: readonly { t: number; data: MinimapData }[];
	kills: readonly ScannerMatchKill[];
	deathTimes: readonly number[];
	live: readonly { t: number; data: ObjectiveData }[];
	swapFlags: readonly boolean[];
	swap: boolean;
	minimapSwapped: boolean;
}

/**
 * Solves each side's slot→row assignment from the match's identity evidence
 * (slotRowEvidence), plus the diamond's name-based assignment.
 */
function slotRowPermutations(inputs: SlotRowInputs): SlotRowPerms {
	const strip = slotRowEvidence(inputs).map(slotRowPermutation) as [
		SlotRowPermutation,
		SlotRowPermutation,
	];

	const rowNames = rowNamesOf(inputs.rows);
	const friendlySide = inputs.minimapSwapped ? 1 : 0;
	const cardNames: string[][] = [[], [], [], []];
	for (const read of inputs.minimapReads) {
		if (read.data.spectator) continue;
		for (const [slot, mate] of read.data.teammates.entries()) {
			const name = mate.name?.trim();
			if (name) cardNames[slot]!.push(name);
		}
	}
	const diamond = cardNames.some((names) => names.length > 0)
		? nameSlotRowPermutation(cardNames, rowNames[friendlySide]!)
		: null;

	return { strip, diamond };
}

/**
 * Each side's slot × row identity evidence (slot-row-assignment.ts), every
 * source oriented into `teams` sides: strip weapon votes read-by-read, minimap
 * card weapons through the minimap anchor, and the statuses of players known
 * by name — the POV's own death screens, its kill-feed victims and the POV
 * minimap's named teammate cards — against the strip reads around them.
 */
function slotRowEvidence({
	rows: allRows,
	povIndex,
	playerStatuses,
	stripWeapons,
	minimapReads,
	kills,
	deathTimes,
	live,
	swapFlags,
	swap,
	minimapSwapped,
}: SlotRowInputs): [SlotRowEvidence, SlotRowEvidence] {
	const rowWeapons = [0, 1].map((side) =>
		allRows
			.slice(side * PLAYERS_PER_TEAM, (side + 1) * PLAYERS_PER_TEAM)
			.map((player) => player.weaponId),
	);
	const rowNames = rowNamesOf(allRows);
	const evidence = [emptySlotRowEvidence(), emptySlotRowEvidence()];
	const sourceSide = (t: number, side: 0 | 1): 0 | 1 =>
		stripSourceSide(live, swapFlags, swap, t, side);

	for (const read of stripWeapons) {
		for (const side of [0, 1] as const) {
			const slots = read.data.slots[sourceSide(read.t, side)];
			for (const [slot, candidates] of slots.entries()) {
				if (!candidates || candidates.length === 0) continue;
				const floor = candidates.at(-1)!.score;
				for (const candidate of candidates) {
					addWeaponEvidence(
						evidence[side]!,
						slot,
						candidate.weaponId,
						candidate.score - floor,
						rowWeapons[side]!,
					);
				}
			}
		}
	}

	// enemy cards mirror the strip seating (attested); the spectator
	// screen's own column is assumed symmetric. The POV diamond is not
	// strip-seated and votes for nothing.
	const enemySide = minimapSwapped ? 0 : 1;
	const friendlySide = (1 - enemySide) as 0 | 1;
	for (const read of minimapReads) {
		const columns = [
			{ side: enemySide, cards: read.data.enemies },
			...(read.data.spectator
				? [{ side: friendlySide, cards: read.data.teammates }]
				: []),
		];
		for (const { side, cards } of columns) {
			for (const [slot, card] of cards.entries()) {
				if (card.weaponId === null) continue;
				addWeaponEvidence(
					evidence[side]!,
					slot,
					card.weaponId,
					MINIMAP_CARD_VOTE,
					rowWeapons[side]!,
				);
			}
		}
	}

	const snapshots = [0, 1].map((side) =>
		playerStatuses.map((read): StripSnapshot => {
			const flags = statusFlagsOf(read.data);
			return {
				t: read.t,
				dead: flags.dead[sourceSide(read.t, side as 0 | 1)],
				special: flags.special[sourceSide(read.t, side as 0 | 1)],
			};
		}),
	);
	const observe = (side: 0 | 1, observation: StatusObservation): void =>
		addStatusEvidence(evidence[side]!, snapshots[side]!, observation);
	const povSide =
		povIndex === null ? null : ((povIndex < PLAYERS_PER_TEAM ? 0 : 1) as 0 | 1);
	const povRow = povIndex === null ? null : povIndex % PLAYERS_PER_TEAM;
	if (povSide !== null && povRow !== null) {
		for (const t of deathTimes) {
			observe(povSide, {
				t,
				row: povRow,
				dead: true,
				special: null,
			});
		}
		const victimSide = (1 - povSide) as 0 | 1;
		for (const kill of kills) {
			const row =
				kill.name === null ? null : rowByName(kill.name, rowNames[victimSide]!);
			if (row === null) continue;
			observe(victimSide, {
				t: kill.t + KILL_STRIP_DELAY_SECONDS,
				row,
				dead: true,
				special: null,
			});
		}
	}
	for (const read of minimapReads) {
		if (read.data.spectator) continue;
		for (const mate of read.data.teammates) {
			const row = mate.self
				? povSide === friendlySide
					? povRow
					: null
				: mate.name === null
					? null
					: rowByName(mate.name, rowNames[friendlySide]!);
			if (row === null) continue;
			observe(friendlySide, {
				t: read.t,
				row,
				dead: mate.dead,
				special: mate.dead ? null : mate.specialReady,
			});
		}
	}

	return evidence as [SlotRowEvidence, SlotRowEvidence];
}

/**
 * Weapons for the rows a minimap-grouped match's cards left unread (a card
 * hidden under a streamer's overlay, the POV's own), off the strip slot the
 * identity evidence places at each such row: the slot's StripWeapons votes
 * (each read's score over its candidate floor) summed per weapon, taken when
 * they clearly lead every other weapon (MIN_STRIP_FILL_VOTE, STRIP_FILL_LEAD).
 * Between kits of that weapon, the one ranked above the other read by read
 * (KIT_HEAD_TO_HEAD_SHARE), else the base weapon. Rows the evidence leaves
 * open, and rows a card named, stay as they are.
 */
function stripFilledRowWeapons(inputs: SlotRowInputs): (MainWeaponId | null)[] {
	const evidence = slotRowEvidence(inputs);
	const filled = inputs.rows.map((row) => row.weaponId);
	for (const side of [0, 1] as const) {
		const rowSlots = decidedRowSlots(evidence[side]);
		for (const [row, slot] of rowSlots.entries()) {
			const index = side * PLAYERS_PER_TEAM + row;
			if (slot === null || filled[index] !== null) continue;
			filled[index] = stripVoteWinner(inputs, side, slot);
		}
	}
	return filled;
}

function stripVoteWinner(
	{ stripWeapons, live, swapFlags, swap }: SlotRowInputs,
	side: 0 | 1,
	slot: number,
): MainWeaponId | null {
	const votes = new Map<MainWeaponId, number>();
	const rankings: MainWeaponId[][] = [];
	for (const read of stripWeapons) {
		const candidates =
			read.data.slots[stripSourceSide(live, swapFlags, swap, read.t, side)][
				slot
			];
		if (!candidates || candidates.length === 0) continue;
		const floor = candidates.at(-1)!.score;
		for (const { weaponId, score } of candidates) {
			votes.set(weaponId, (votes.get(weaponId) ?? 0) + score - floor);
		}
		rankings.push(candidates.map((candidate) => candidate.weaponId));
	}
	const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
	const [first] = ranked;
	if (!first || first[1] < MIN_STRIP_FILL_VOTE) return null;
	const base = weaponIdToBaseWeaponId(first[0]);
	const isKit = ([weaponId]: [MainWeaponId, number]) =>
		weaponIdToBaseWeaponId(weaponId) === base;
	const rival = ranked.find((entry) => !isKit(entry));
	if (rival && first[1] < STRIP_FILL_LEAD * rival[1]) return null;
	const kit = ranked.find((entry) => entry !== first && isKit(entry));
	if (!kit || first[1] >= STRIP_FILL_LEAD * kit[1]) return first[0];
	return headToHeadKit(rankings, first[0], kit[0]) ?? base;
}

/** The kit ranked above the other on at least KIT_HEAD_TO_HEAD_SHARE of the reads ranking both; null on a closer split. */
function headToHeadKit(
	rankings: readonly MainWeaponId[][],
	a: MainWeaponId,
	b: MainWeaponId,
): MainWeaponId | null {
	let aAhead = 0;
	let both = 0;
	for (const ranking of rankings) {
		const aRank = ranking.indexOf(a);
		const bRank = ranking.indexOf(b);
		if (aRank === -1 || bRank === -1) continue;
		both++;
		if (aRank < bRank) aAhead++;
	}
	if (both === 0) return null;
	if (aAhead / both >= KIT_HEAD_TO_HEAD_SHARE) return a;
	if ((both - aAhead) / both >= KIT_HEAD_TO_HEAD_SHARE) return b;
	return null;
}

/** The strip side a read draws `teams` side `side` on (casts follow the specced player). */
function stripSourceSide(
	live: readonly { t: number; data: ObjectiveData }[],
	swapFlags: readonly boolean[],
	swap: boolean,
	t: number,
	side: 0 | 1,
): 0 | 1 {
	return nearestSwapFlag(live, swapFlags, t) !== swap
		? ((1 - side) as 0 | 1)
		: side;
}

function rowNamesOf(
	rows: SlotRowInputs["rows"],
): [(string | null)[], (string | null)[]] {
	return [0, 1].map((side) =>
		rows
			.slice(side * PLAYERS_PER_TEAM, (side + 1) * PLAYERS_PER_TEAM)
			.map((player) => player.name?.trim() || null),
	) as [(string | null)[], (string | null)[]];
}

/**
 * The permutation a status read's `sourceSide` flags take to teams side `side`:
 * strip-seated sources use the weapon-vote assignment, the POV diamond its name
 * assignment; a minimap-grouped match (no perms) keeps everything as drawn.
 */
function readPermutation(
	perms: SlotRowPerms | null,
	read: StatusRead,
	sourceSide: 0 | 1,
	side: 0 | 1,
): SlotRowPermutation {
	if (!perms) return IDENTITY_PERMUTATION;
	if (read.fromMinimap && sourceSide === 0 && !read.spectator) {
		return perms.diamond ?? IDENTITY_PERMUTATION;
	}
	return perms.strip[side];
}

/** An unknown mode gets the ranked clock: Turf War's start window lies within its chargeable time. */
function clockSecondsOf(mode: ModeShort | null): number {
	return mode === "TW" ? TURF_WAR_CLOCK_SECONDS : RANKED_CLOCK_SECONDS;
}

/**
 * The oriented status reads as samples, each player's states decoded over the
 * whole game (status-decode.ts); a sample's flags are its decoded states.
 */
function decodedSamples(
	reads: readonly {
		t: number;
		time: number | null;
		elapsed: number | null;
		slots: [ReadSide, ReadSide];
	}[],
): ScannerMatchPlayerStatusSample[] {
	const decoded = [0, 1].map((side) =>
		[0, 1, 2, 3].map((slot) =>
			StatusDecode.decode(
				reads.map((read) => ({
					t: read.t,
					elapsed: read.elapsed,
					evidence: read.slots[side]![slot] ?? null,
				})),
			),
		),
	);
	return reads.map((read, i) => {
		const flags = (state: StatusDecode.DecodedState) =>
			decoded.map((side) => side.map((states) => states[i] === state)) as [
				PlayerStatusFlags,
				PlayerStatusFlags,
			];
		return {
			t: Math.max(0, Math.floor(read.t)),
			time: read.time,
			special: flags("ready"),
			dead: flags("dead"),
		};
	});
}

/** One side of a status read, slots in order; null = a slot the read did not show (a card missing). */
type ReadSide = (SlotEvidence | null)[];

/** A status read from either source, sides as read (pre-orientation). */
interface StatusRead {
	t: number;
	/** minimap sides are own/enemy — camera-stable, unlike the HUD plates */
	fromMinimap: boolean;
	/** minimap reads only: the 8-card spectator screen, whose own column is card-seated like the enemy one — the POV diamond is not (see readPermutation) */
	spectator?: boolean;
	data: {
		time: number | null;
		slots: [ReadSide, ReadSide];
	};
}

/**
 * The minimap reads' card states as status reads: own side first, slots in card
 * order (the order `teamsFromMinimaps` seats players), absent cards padded
 * false. A read that saw no cards identifies nobody and contributes nothing.
 */
function minimapStatusReads(
	minimapReads: readonly { t: number; data: MinimapData }[],
): StatusRead[] {
	return minimapReads.flatMap((read): StatusRead[] => {
		const { teammates, enemies } = read.data;
		if (teammates.length === 0 && enemies.length === 0) return [];
		return [
			{
				t: read.t,
				fromMinimap: true,
				spectator: read.data.spectator,
				data: {
					time: null,
					slots: [sideEvidence(teammates), sideEvidence(enemies)],
				},
			},
		];
	});
}

/** The cards' states as evidence, slots past the shown cards unread. */
function sideEvidence(
	players: readonly { dead: boolean; specialReady: boolean }[],
): ReadSide {
	return [0, 1, 2, 3].map((slot) => {
		const player = players[slot];
		if (!player) return null;
		return FLAGGED_STATE_EVIDENCE[
			player.dead ? "dead" : player.specialReady ? "ready" : "alive"
		];
	});
}

/**
 * The cluster-orientation flag of the counter read nearest in time — status
 * reads come off the same frames, so the nearest one saw the same camera
 * arrangement. False when no counter read carried a flag (POV never swaps).
 */
function nearestSwapFlag(
	objectives: readonly { t: number }[],
	swapFlags: readonly boolean[],
	t: number,
): boolean {
	let best = -1;
	for (const [i, read] of objectives.entries()) {
		if (
			best === -1 ||
			Math.abs(read.t - t) < Math.abs(objectives[best]!.t - t)
		) {
			best = i;
		}
	}
	return best === -1 ? false : (swapFlags[best] ?? false);
}

/** A counter read with its sides in cluster (first-read) order. */
interface OrientedObjectiveRead {
	t: number;
	time: number | null;
	score: [number | null, number | null];
	penalty: [number | null, number | null];
	control: 0 | 1 | null;
	/** TC/RM only: the objective along the track, positive = the first side's progress */
	position?: number | null;
}

/**
 * The two team-ink cluster hues, seeded from the first read that saw both sides
 * far enough apart; null when none qualifies (orientation stays as read).
 */
function seedClusterHues(
	objectives: readonly { data: ObjectiveData }[],
): [number, number] | null {
	for (const { data } of objectives) {
		const [left, right] = data.teamColor;
		if (left === null || right === null) continue;
		const hues: [number, number] = [hueOf(left), hueOf(right)];
		if (hueDistance(hues[0], hues[1]) >= MIN_TEAM_HUE_SEPARATION) return hues;
	}
	return null;
}

/**
 * Per-read side orientation: a read whose ink hues sit closer to the clusters
 * crosswise is swapped (the cast switched the specced side). Reads with no
 * readable color inherit the previous orientation — plates only rearrange with
 * a camera change, which leaves the colors readable once they are back.
 */
function readSwapFlags(
	objectives: readonly { t: number; data: ObjectiveData }[],
	clusterHues: [number, number] | null,
): boolean[] {
	let previousSwapped = false;
	return objectives.map(({ data }) => {
		const swapped = clusterHues
			? readSwapped(data, clusterHues, previousSwapped)
			: false;
		previousSwapped = swapped;
		return swapped;
	});
}

/** The counter reads with their sides in cluster (first-read) order. */
function orientObjectives(
	objectives: readonly { t: number; data: ObjectiveData }[],
	swapFlags: readonly boolean[],
): OrientedObjectiveRead[] {
	return objectives.map(({ t, data }, i): OrientedObjectiveRead => {
		const [a, b] = swapFlags[i] ? ([1, 0] as const) : ([0, 1] as const);
		const oriented: OrientedObjectiveRead = {
			t,
			time: data.time,
			score: [data.score[a], data.score[b]],
			penalty:
				data.mode === "SZ" ? [data.penalty[a], data.penalty[b]] : [null, null],
			control: swapFlags[i] ? flippedSide(data.control) : data.control,
		};
		if (data.mode === "SZ") return oriented;
		return {
			...oriented,
			position: swapFlags[i] ? flippedPosition(data.position) : data.position,
		};
	});
}

function flippedSide(side: 0 | 1 | null): 0 | 1 | null {
	return side === null ? null : side === 0 ? 1 : 0;
}

/** A track position seen from the other side: each team pushes toward the other's end. */
function flippedPosition(position: number | null): number | null {
	return position === null ? null : 0 - position;
}

function readSwapped(
	data: ObjectiveData,
	clusterHues: [number, number],
	previousSwapped: boolean,
): boolean {
	const [left, right] = data.teamColor;
	if (left === null && right === null) return previousSwapped;
	const identityCost =
		(left ? hueDistance(hueOf(left), clusterHues[0]) : 0) +
		(right ? hueDistance(hueOf(right), clusterHues[1]) : 0);
	const swappedCost =
		(left ? hueDistance(hueOf(left), clusterHues[1]) : 0) +
		(right ? hueDistance(hueOf(right), clusterHues[0]) : 0);
	if (identityCost === swappedCost) return previousSwapped;
	return swappedCost < identityCost;
}

/**
 * Whether the cluster order is bravo-first, judged against the minimap's ink
 * colors (own then enemy) — the `teams` anchor for cast matches.
 */
function minimapAnchorSwap(
	clusterHues: [number, number] | null,
	minimapColors: [InkRgb | null, InkRgb | null] | null,
): boolean {
	if (!clusterHues || !minimapColors) return false;
	const [own, enemy] = minimapColors;
	if (own === null && enemy === null) return false;
	const identityCost =
		(own ? hueDistance(hueOf(own), clusterHues[0]) : 0) +
		(enemy ? hueDistance(hueOf(enemy), clusterHues[1]) : 0);
	const swappedCost =
		(own ? hueDistance(hueOf(own), clusterHues[1]) : 0) +
		(enemy ? hueDistance(hueOf(enemy), clusterHues[0]) : 0);
	return swappedCost < identityCost;
}

/** Componentwise mean of the minimap reads' per-side ink colors; null when unread. */
function minimapTeamColors(
	minimaps: readonly MinimapData[],
): [InkRgb | null, InkRgb | null] | null {
	if (minimaps.length === 0) return null;
	const sides = [0, 1].map((side): InkRgb | null => {
		const colors = minimaps
			.map((minimap) => minimap.teamColors[side as 0 | 1])
			.filter((color): color is InkRgb => color !== null);
		if (colors.length === 0) return null;
		return {
			r: Math.round(colors.reduce((sum, c) => sum + c.r, 0) / colors.length),
			g: Math.round(colors.reduce((sum, c) => sum + c.g, 0) / colors.length),
			b: Math.round(colors.reduce((sum, c) => sum + c.b, 0) / colors.length),
		};
	}) as [InkRgb | null, InkRgb | null];
	return sides[0] === null && sides[1] === null ? null : sides;
}

/**
 * Drops reads off broadcast replays and edited VoDs showing a moment again
 * (core/clock.ts); a timerless read follows the clock span it falls in. A
 * misread timer takes its span's prediction.
 */
function onLiveClock<T extends { t: number; data: { time: number | null } }>(
	reads: readonly T[],
	clock: readonly Clock.ClockSpan[],
): T[] {
	return reads.flatMap((read) => {
		const { live, time } = Clock.position(clock, {
			t: read.t,
			time: read.data.time,
		});
		if (!live) return [];
		return time === read.data.time
			? [read]
			: [{ ...read, data: { ...read.data, time } }];
	});
}

/**
 * Voids score reads that contradict SZ's countdown: per side, only the longest
 * non-increasing subsequence of readable scores is kept and every read off it
 * gets that side's score nulled (penalty/control stand). A misread (a truncated
 * "50" charted as 0, a stray 100) is always the minority, so it is what drops.
 */
function withMonotonicScores(
	oriented: readonly OrientedObjectiveRead[],
): OrientedObjectiveRead[] {
	const smoothed = oriented.map((read) => ({
		...read,
		score: [...read.score] as [number | null, number | null],
	}));
	for (const side of [0, 1] as const) {
		const readIndices = smoothed.flatMap((read, i) =>
			read.score[side] !== null ? [i] : [],
		);
		const kept = longestNonIncreasingRun(
			readIndices.map((i) => smoothed[i]!.score[side]!),
		);
		for (const [k, i] of readIndices.entries()) {
			if (!kept.has(k)) smoothed[i]!.score[side] = null;
		}
	}
	return smoothed;
}

/** Indices of one longest non-increasing subsequence of `values`. */
function longestNonIncreasingRun(values: readonly number[]): Set<number> {
	const lengths = new Array<number>(values.length).fill(1);
	const prev = new Array<number>(values.length).fill(-1);
	let bestEnd = values.length > 0 ? 0 : -1;
	for (let i = 0; i < values.length; i++) {
		for (let j = 0; j < i; j++) {
			if (values[j]! >= values[i]! && lengths[j]! + 1 > lengths[i]!) {
				lengths[i] = lengths[j]! + 1;
				prev[i] = j;
			}
		}
		if (lengths[i]! > lengths[bestEnd]!) bestEnd = i;
	}
	const kept = new Set<number>();
	for (let i = bestEnd; i !== -1; i = prev[i]!) kept.add(i);
	return kept;
}

/** The lowest count a side ever showed; Infinity when never read. */
function bestCount(
	oriented: readonly OrientedObjectiveRead[],
	side: 0 | 1,
): number {
	return Math.min(
		...oriented.map((read) => read.score[side] ?? Number.POSITIVE_INFINITY),
	);
}

/**
 * A history screen whose stage went unread names no game of its own (typically
 * a frame caught mid-transition), so it may only join an already built match.
 */
function isStagelessHistoryRead(event: DetectedEvent): boolean {
	return isHistoryScoreboardEvent(event) && event.data.stage === null;
}

/**
 * Whether a history screen shows another game than the one `game` holds the
 * reads of: the stage or mode its intro or minimaps read disagrees, or its
 * recording time, moved onto the PC clock by `consoleOffset`, is too far from
 * when those reads were seen. Without such evidence it closes the game,
 * standing in for a missed results screen.
 */
function isHistoryOfAnotherGame<E extends DetectedEvent>(
	event: E,
	game: Game<E>,
	consoleOffset: number,
): boolean {
	if (!isHistoryScoreboardEvent(event)) return false;
	if (contradictsReads(event, game)) return true;
	const distance = recordingDistance(event, game, consoleOffset);
	return distance !== null && distance > GameIdentity.PLAYED_AT_TOLERANCE_MS;
}

/** Whether a board's stage or mode disagrees with what the game's intro or minimaps read. */
function contradictsReads<E extends DetectedEvent>(
	event: E & ScoreboardFamilyEvent,
	game: Game<E>,
): boolean {
	const board = event.data;
	const start = game.mapStart?.data;
	const stage = start?.stage ?? GameSegments.leadingStage(game.stageVotes);
	if (stage !== null && board.stage !== null && stage !== board.stage) {
		return true;
	}
	const mode = start?.mode ?? null;
	return mode !== null && board.mode !== null && mode !== board.mode;
}

/** How far a history screen's recording time, on the PC clock, is from the game's first read; null when either is unknown. */
function recordingDistance<E extends DetectedEvent>(
	event: E,
	game: Game<E>,
	consoleOffset: number,
): number | null {
	const recorded = GameIdentity.recordedAt(event);
	const firstRead = firstReadAt(game);
	if (recorded === null || firstRead === null) return null;
	return Math.abs(recorded - consoleOffset - firstRead);
}

/**
 * The earlier game a battle history screen completes, its results screen
 * missed: one with gameplay read before the screen, backed but closed by no
 * board, whose reads the screen doesn't contradict (`isHistoryOfAnotherGame`),
 * the one first read closest to the recording time. Without times to compare
 * (VoD scans, an unread timestamp) only a sole fitting game is taken.
 */
function missedResultsGame<E extends DetectedEvent>(
	shown: E & ScoreboardFamilyEvent,
	segmentGames: readonly {
		segment: GameSegments.Segment<E>;
		game: Game<E>;
	}[],
	consoleOffset: number,
): Game<E> | undefined {
	const fitting = segmentGames.flatMap(({ segment, game }) =>
		game.scoreboard === null &&
		segment.to < shown.t &&
		isBacked(game) &&
		!isHistoryOfAnotherGame(shown, game, consoleOffset)
			? [game]
			: [],
	);

	let closest: { game: Game<E>; distance: number } | undefined;
	for (const game of fitting) {
		const distance = recordingDistance(shown, game, consoleOffset);
		if (distance === null) continue;
		if (!closest || distance < closest.distance) closest = { game, distance };
	}
	if (closest) return closest.game;

	return fitting.length === 1 ? fitting[0] : undefined;
}

/**
 * How far the console clock (the history screens' recording times) runs from
 * the PC's (detection times), told by the scan itself: every game paired with
 * each history screen of its stage and mode browsed after it gives an offset,
 * and the one taken is the offset that distinct games and distinct screens,
 * paired one to one, agree on most (`CONSOLE_OFFSET_MIN_SUPPORT` at least):
 * the console set to another timezone than the PC, or a misread AM/PM letter
 * on every screen. 0 without such agreement: a lone pairing could be an older
 * game browsed.
 */
function consoleClockOffset<E extends DetectedEvent>(
	segments: readonly GameSegments.Segment<E>[],
	games: readonly Game<E>[],
	identities: readonly GameIdentity.GameIdentity<E>[],
): number {
	const shownGames = identities.flatMap((identity) => {
		if (!identity.every(isHistoryScoreboardEvent)) return [];
		const shown = identity.find((board) => !isStagelessHistoryRead(board));
		const recorded = shown ? GameIdentity.recordedAt(shown) : null;
		return shown && recorded !== null ? [{ shown, recorded }] : [];
	});
	const pairs: { game: number; shown: number; offset: number }[] = [];
	for (const [gameIndex, game] of games.entries()) {
		const firstRead = firstReadAt(game);
		if (firstRead === null) continue;
		for (const [shownIndex, { shown, recorded }] of shownGames.entries()) {
			if (shown.t <= segments[gameIndex]!.to) continue;
			if (contradictsReads(shown, game)) continue;
			pairs.push({
				game: gameIndex,
				shown: shownIndex,
				offset: recorded - firstRead,
			});
		}
	}

	let best = { offset: 0, support: 0 };
	for (const candidate of pairs) {
		const support = oneToOnePairings(
			pairs.filter(
				(pair) =>
					Math.abs(pair.offset - candidate.offset) <=
					CONSOLE_OFFSET_AGREEMENT_MS,
			),
		);
		if (
			support > best.support ||
			(support === best.support &&
				Math.abs(candidate.offset) < Math.abs(best.offset))
		) {
			best = { offset: candidate.offset, support };
		}
	}
	return best.support >= CONSOLE_OFFSET_MIN_SUPPORT ? best.offset : 0;
}

/** How many of the pairs hold no game and no screen twice (greedy, in order). */
function oneToOnePairings(
	pairs: readonly { game: number; shown: number }[],
): number {
	const games = new Set<number>();
	const shown = new Set<number>();
	for (const pair of pairs) {
		if (games.has(pair.game) || shown.has(pair.shown)) continue;
		games.add(pair.game);
		shown.add(pair.shown);
	}
	return games.size;
}

/** When the earliest of the game's reads was seen (wall clock); null on VoD scans. */
function firstReadAt<E extends DetectedEvent>(game: Game<E>): number | null {
	const readTimes = gameInputs(game)
		.map(GameIdentity.detectedAtOf)
		.filter((t) => t !== null);
	return readTimes.length > 0 ? Math.min(...readTimes) : null;
}

/**
 * The match with the real names a battle log screen revealed: X Battle's
 * results screen shows every player under a random alias, which the log
 * swaps for the real names when asked. Only a results screen's names are
 * taken for aliases — on a match closed by a history screen it can't be told
 * which of two name sets is the real one. The POV player's splats follow
 * their victims' rows.
 */
function withRevealedNames<E extends DetectedEvent>(
	match: ScannerMatch,
	sources: readonly E[],
	history: E & ScoreboardFamilyEvent,
): ScannerMatch {
	const results = sources.find((source) =>
		isEventOfType(source, SCOREBOARD_EVENT_TYPE),
	);
	const realNames = results ? renamedRows(results.data, history.data) : null;
	if (!realNames) return match;

	const teams = match.teams.map((team, side) => ({
		players: team.players.map((player, index) => {
			const name = realNames.get(side * PLAYERS_PER_TEAM + index);
			return name ? { ...player, name } : player;
		}),
	})) as ScannerMatch["teams"];
	const enemySide = match.pov?.team === 1 ? 0 : 1;
	const kills =
		match.kills?.map((kill) => {
			const slot = victimSlot(kill.name, match.teams[enemySide].players);
			if (slot === null) return kill;
			return { ...kill, name: teams[enemySide].players[slot]!.name };
		}) ?? null;

	return { ...match, teams, kills };
}

function teamsFromScoreboard(
	board: ScoreboardData,
	deaths: readonly DeathData[],
	minimaps: readonly MinimapData[],
	minimapEnemySide: 0 | 1 | null,
): [ScannerMatchTeam, ScannerMatchTeam] {
	const abilities = harvestAbilities(board.players, deaths);
	const cardMains =
		minimapEnemySide !== null
			? minimapMainsByRow(board, minimaps, minimapEnemySide)
			: new Map<number, GearMains>();
	const players = board.players.map((player, i): ScannerMatchPlayer => {
		const build = mergeBuild(abilities.get(i), cardMains.get(i));
		return {
			name: player.name.trim() || null,
			weaponId: player.weaponId,
			paint: player.paint,
			ka: player.ka,
			d: player.d,
			s: player.s,
			...(build ? { abilities: build } : null),
		};
	});
	return [
		{ players: players.slice(0, PLAYERS_PER_TEAM) },
		{ players: players.slice(PLAYERS_PER_TEAM) },
	];
}

/** The POV's own card's index among the merged teammates: its drawn index in frames showing every card. */
function minimapSelfIndex(minimaps: readonly MinimapData[]): number | null {
	for (const frame of minimaps) {
		if (frame.spectator || frame.teammates.length !== PLAYERS_PER_TEAM) {
			continue;
		}
		const index = frame.teammates.findIndex((mate) => mate.self);
		if (index !== -1) return index;
	}
	return null;
}

function withRowWeapons(
	teams: [ScannerMatchTeam, ScannerMatchTeam],
	rowWeapons: readonly (MainWeaponId | null)[] | null,
): [ScannerMatchTeam, ScannerMatchTeam] {
	if (!rowWeapons) return teams;
	return teams.map((team, side) => ({
		...team,
		players: team.players.map((player, row) => ({
			...player,
			weaponId:
				player.weaponId ?? rowWeapons[side * PLAYERS_PER_TEAM + row] ?? null,
		})),
	})) as [ScannerMatchTeam, ScannerMatchTeam];
}

/** The reads' data, the read whose fields scored best on average first. */
function bestScoredFirst(
	events: readonly EventOfType<typeof MINIMAP_EVENT_TYPE>[],
): MinimapData[] {
	return [...events]
		.sort((a, b) => FieldScores.mean(b.scores) - FieldScores.mean(a.scores))
		.map((event) => event.data);
}

/**
 * Players merged across a match's minimap frames, alpha then bravo: weapons and
 * names are fixed for a match, so a slot missed in one frame is filled from
 * another (first read wins).
 */
function teamsFromMinimaps(
	frames: readonly MinimapData[],
	deaths: readonly DeathData[],
): [ScannerMatchTeam, ScannerMatchTeam] {
	const alpha = mergeSlots(frames.map((frame) => frame.teammates));
	const bravo = mergeSlots(frames.map((frame) => frame.enemies));

	const players = [...alpha, ...bravo];
	const abilities = harvestAbilities(players, deaths);
	const withAbilities = players.map((player, i) => {
		const build = abilities.get(i);
		return build ? { ...player, abilities: build } : player;
	});

	return [
		{ players: withAbilities.slice(0, alpha.length) },
		{ players: withAbilities.slice(alpha.length) },
	];
}

/**
 * For each slot index, the name most frames read (the first frame's on a tie)
 * and the first frame's non-null read of every other field.
 */
function mergeSlots(
	frames: Array<Array<MinimapCardRead>>,
): ScannerMatchPlayer[] {
	const width = Math.max(0, ...frames.map((frame) => frame.length));
	const out: ScannerMatchPlayer[] = [];
	for (let i = 0; i < width; i++) {
		const reads = frames
			.map((frame) => frame[i])
			.filter((read) => read !== undefined);
		const mains = mergeMains(reads.map((read) => read.abilities));
		out.push({
			name: mostReadName(reads.map((read) => read.name?.trim() || null)),
			weaponId:
				reads.map((read) => read.weaponId).find((id) => id !== null) ?? null,
			paint: null,
			ka: null,
			d: null,
			s: null,
			...(mains ? { abilities: mainsAsRows(mains) } : null),
		});
	}
	return out;
}

function mostReadName(reads: readonly (string | null)[]): string | null {
	const counts = new Map<string, number>();
	for (const name of reads) {
		if (name !== null) counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	let best: string | null = null;
	for (const [name, count] of counts) {
		if (best === null || count > counts.get(best)!) best = name;
	}
	return best;
}

/** the gear slots a build has, in card/death-screen order */
const GEAR_SLOTS = [0, 1, 2];

interface MinimapCardRead {
	name: string | null;
	weaponId: MainWeaponId | null;
	abilities: GearMains;
}

/**
 * Gear mains per scoreboard row, harvested from the minimap cards. A card's
 * drawn position is no seat (frames leave absent cards out of their columns),
 * so cards identify their row by name and weapon within their own column's
 * side (own/enemy is camera-stable, unlike the HUD plates).
 */
function minimapMainsByRow(
	board: ScoreboardData,
	minimaps: readonly MinimapData[],
	enemySide: 0 | 1,
): Map<number, GearMains> {
	const cards: [MinimapCardRead[], MinimapCardRead[]] = [[], []];
	for (const frame of minimaps) {
		cards[enemySide].push(...frame.enemies);
		cards[enemySide === 0 ? 1 : 0].push(...frame.teammates);
	}
	const mains = new Map<number, GearMains>();
	for (const side of [0, 1] as const) {
		const rows = board.players.slice(
			side * PLAYERS_PER_TEAM,
			(side + 1) * PLAYERS_PER_TEAM,
		);
		for (const [row, build] of harvestCardMains(rows, cards[side])) {
			mains.set(side * PLAYERS_PER_TEAM + row, build);
		}
	}
	return mains;
}

/**
 * The gear mains a set of card reads agree on: badges come and go with
 * cross-outs and camo, so each slot takes its first identified read. Null when
 * no read identified any of the three.
 */
function mergeMains(reads: readonly GearMains[]): GearMains | null {
	const mains = GEAR_SLOTS.map((slot) => {
		const read = reads
			.map((abilities) => abilities[slot] ?? null)
			.filter((ability) => ability !== null);
		return read.find((ability) => ability !== "UNKNOWN") ?? read[0] ?? null;
	});
	return mains.some((ability) => ability !== null) ? mains : null;
}

/** Minimap cards show no sub slots, so each gear row holds its main alone. */
function mainsAsRows(mains: GearMains): AbilityWithUnknown[][] {
	return mains.map((main) => [main ?? "UNKNOWN"]);
}

/**
 * One player's gear rows: death screens read whole rows (main and subs),
 * minimap cards only mains — so a death row stands and the cards fill in
 * the mains it left unread.
 */
function mergeBuild(
	death: AbilityWithUnknown[][] | undefined,
	mains: GearMains | undefined,
): AbilityWithUnknown[][] | undefined {
	if (!mains) return death;
	if (!death) return mainsAsRows(mains);
	return GEAR_SLOTS.map((slot) => {
		const row = death[slot] ?? [];
		if (row.length > 0 && row[0] !== "UNKNOWN") return row;
		return [mains[slot] ?? row[0] ?? "UNKNOWN", ...row.slice(1)];
	});
}
