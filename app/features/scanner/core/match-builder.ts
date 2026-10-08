/**
 * Groups a detected-event timeline into ScannerMatch objects
 * (scanner-match.ts). A MapStart opens a match, a scoreboard-type event
 * closes one, and deaths in between belong to it; a scoreboard with no
 * preceding MapStart claims the last 8 minutes of deaths. Without delimiters
 * (casted footage) minimaps group per map by stage change and time gap. A
 * match is emitted only when a scoreboard or minimaps back it, regardless of
 * lobby/outcome — `ingestSkipReasons` filters those (the clip scorer alone
 * asks for the unbacked ones too). Deaths are harvested
 * onto player rows as enemy builds (ability-harvest.ts).
 */
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { isUploadedLobby } from "../scanner-types";
import {
	type GearMains,
	harvestAbilities,
	harvestCardMains,
} from "./ability-harvest";
import { DEATH_EVENT_TYPE, type DeathData } from "./detectors/death/index";
import { KILL_EVENT_TYPE, type KillData } from "./detectors/kill/index";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "./detectors/map-start/index";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
} from "./detectors/minimap/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "./detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
	type PlayerStatusFlags,
} from "./detectors/objective/player-status";
import {
	STRIP_WEAPONS_EVENT_TYPE,
	type StripWeaponsData,
} from "./detectors/objective/strip-weapons";
import { QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "./detectors/quick-scoreboard-battle-log/index";
import { SCOREBOARD_EVENT_TYPES } from "./detectors/registry";
import {
	SCOREBOARD_EVENT_TYPE,
	type ScoreboardData,
} from "./detectors/scoreboard/index";
import {
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
	type ScoreboardBattleLogData,
} from "./detectors/scoreboard-battle-log/index";
import {
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
	type ScoreboardBattleLogReplayData,
} from "./detectors/scoreboard-battle-log-replay/index";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "./detectors/scoreboard-own/index";
import type { DetectedEvent } from "./detectors/types";
import { hueDistance, hueOf, type InkRgb } from "./ink-color";
import { parseReplayTimestamp } from "./replay-time";
import type {
	ScannerMatch,
	ScannerMatchKill,
	ScannerMatchObjective,
	ScannerMatchObjectiveSample,
	ScannerMatchPlayer,
	ScannerMatchPlayerStatus,
	ScannerMatchPlayerStatusSample,
	ScannerMatchTeam,
} from "./scanner-match";
import {
	applyPermutation,
	IDENTITY_PERMUTATION,
	nameSlotRowPermutation,
	type SlotRowPermutation,
	weaponSlotRowPermutation,
} from "./slot-row-assignment";
import { editDistance, matchKey } from "./text";
import { multisetOverlap } from "./timeline/same-scoreboard";
import { X_BATTLE_CARD_EVENT_TYPES } from "./x-battle";

/** How far back a scoreboard with no MapStart claims deaths: matches run well under 8 min. */
const FALLBACK_WINDOW_SECONDS = 480;

/** Minimaps further apart than this cannot be the same game, even on the same stage. */
const MATCH_GAP_SECONDS = 300;

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
 * A read whose projected clock zero (`t + time`) sits further than this from
 * the match's dominant projection came off a broadcast replay. Live projections
 * jitter a couple of seconds (both clocks round to whole seconds); attested
 * replay wipes land a minute or more away.
 */
const REPLAY_ANCHOR_TOLERANCE_SECONDS = 10;

/**
 * Dead-flag runs whose flank-to-flank span is shorter than these are flipped
 * to their surroundings: the fastest respawn is 3.5s, so no true dead stretch
 * is shorter, while a respawned player CAN be re-splatted fast (spawncamps),
 * so the alive floor stays a conservative 2s. Judging by the flank-to-flank
 * span keeps sparse sampling honest: a lone dead read between far-apart reads
 * spans wide and is left alone.
 */
const DEAD_RUN_MIN_SECONDS = 3.5;
const ALIVE_RUN_MIN_SECONDS = 2;

/**
 * Regaining a used special takes at least this long (nothing charges off ~7s
 * of painting even with max Special Charge Up), so a not-ready run flanked by
 * ready reads closer than this, with no death inside, is a misread gap (the
 * ready wash pulses through a dim trough; overlays clip icons) and is bridged.
 */
const SPECIAL_REGAIN_MIN_SECONDS = 7;

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
 * The personal results screen follows the results screen of the same game;
 * one seen this long after a closed match's scoreboard belongs to that match.
 */
const OWN_RESULTS_WINDOW_SECONDS = 90;

/**
 * The X Battle lobby cards (set count, set result, position) report on the
 * game just played: the lobby shows them after the personal results screen
 * and before the results screen, so they normally join the game still being
 * gathered. A card seen within this of a match closed before it (results
 * screen read first) joins that match; a card with no game open waits this
 * long for a results screen to claim it.
 */
const X_BATTLE_CARDS_WINDOW_SECONDS = 90;

/** Battle history screens: browsing them after playing shows games the timeline already holds. */
const HISTORY_SCOREBOARD_EVENT_TYPES: readonly string[] = [
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
	QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
];

/**
 * Paint totals two boards must share to show the same game: tolerates a couple
 * of misread or unread rows, while different games practically never share this many.
 */
const SAME_GAME_MIN_SHARED_PAINTS = 6;

/**
 * How far a history screen's recording time may sit from the earlier read of
 * the same game, or from the first read of the game it closes: it is on the
 * console clock and marks the game's start, while a results screen's time is
 * the PC clock at the game's end.
 */
const REVISIT_PLAYED_AT_TOLERANCE_MS = 20 * 60 * 1000;

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
}

/**
 * Lets a caller rebuilding a growing timeline reuse each match whose input
 * events are the very same objects as last time, so the per-match work runs
 * only for matches that changed and unchanged ones keep their identity. Keyed
 * by a match's first input event (a match amended from the battle log by the
 * history screen that amended it); events must not be mutated in place.
 */
export type MatchBuildCache<E extends DetectedEvent> = WeakMap<
	E,
	{ inputs: readonly E[]; built: BuiltMatch<E> }
>;

/**
 * Splits a timeline into ScannerMatch objects, chronological. A personal
 * results screen identifies no match of its own but completes the POV
 * player's build on the match whose results screen it follows, and the X
 * Battle lobby cards (shown before that game's results screen) join the
 * sources of the game they report on. A battle
 * history screen showing an already built game (≥6 shared paint totals, stage
 * and recording time not contradicting it) joins that match's `sources` instead of
 * forming a new one, as does a results screen read again with no match
 * opened since. Any other history screen closes the game being gathered (a
 * missed results screen amended from the log) unless its stage, mode or
 * recording time contradicts that game's reads. Then (or with no game being
 * gathered) it completes an earlier match whose results screen was missed
 * instead, when one fits it (`scoreboardlessMatchShown`), else it forms a
 * match of its own and the game being gathered stays open. A history screen
 * with its stage unread and no built match forms none. A map intro right
 * after a replay-browser entry of its stage and mode is that replay played
 * back: its gameplay joins the entry's match. Every input event ends up in at
 * most one match's `sources`.
 *
 * `unbacked` also emits, flagged, the stretches with kill reads no scoreboard,
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
	const built: BuiltMatch<E>[] = [];
	const unbackedBuilt: BuiltMatch<E>[] = [];
	const minimapLookahead = buildMinimapLookahead(sorted);

	let open: OpenMatch<E> | null = null;
	let lastHistoryScreen: E | null = null;
	// matches finalized without a scoreboard, which a history screen may still complete
	const scoreboardless = new Map<BuiltMatch<E>, OpenMatch<E>>();
	// deaths/objective/status reads seen with no match open to anchor them yet
	let orphanDeaths: E[] = [];
	let orphanObjectives: E[] = [];
	let orphanPlayerStatuses: E[] = [];
	let orphanStripWeapons: E[] = [];
	let orphanKills: E[] = [];
	let orphanXBattleCards: E[] = [];
	const finalize = (): void => {
		if (!open) return;
		if (isBacked(open)) {
			const match = cachedBuiltMatch(open, cache);
			built.push(match);
			if (open.scoreboard === null) scoreboardless.set(match, open);
		} else if (unbacked && open.kills.length > 0) {
			unbackedBuilt.push(cachedBuiltMatch(open, cache));
		}
		open = null;
	};
	const claimOrphans = (t: number): OpenMatch<E> => {
		const withinWindow = (read: E) => t - read.t <= FALLBACK_WINDOW_SECONDS;
		return {
			...startMatch(),
			deaths: orphanDeaths.filter(withinWindow),
			objectives: orphanObjectives.filter(withinWindow),
			playerStatuses: orphanPlayerStatuses.filter(withinWindow),
			stripWeapons: orphanStripWeapons.filter(withinWindow),
			kills: orphanKills.filter(withinWindow),
			xBattleCards: orphanXBattleCards.filter(
				(card) => t - card.t <= X_BATTLE_CARDS_WINDOW_SECONDS,
			),
		};
	};
	// orphan reads no scoreboard claimed are left behind
	const dropOrphans = (): void => {
		if (unbacked && orphanKills.length > 0) {
			unbackedBuilt.push(
				cachedBuiltMatch(
					{ ...startMatch(), deaths: orphanDeaths, kills: orphanKills },
					cache,
				),
			);
		}
		orphanDeaths = [];
		orphanObjectives = [];
		orphanPlayerStatuses = [];
		orphanStripWeapons = [];
		orphanKills = [];
		orphanXBattleCards = [];
	};

	for (const event of sorted) {
		if (event.type === MAP_START_EVENT_TYPE) {
			// a new match intro abandons any match whose scoreboard was missed
			finalize();
			dropOrphans();
			open = startMatch();
			open.mapStart = event;
			vote(open.stageVotes, (event.data as MapStartData).stage);
			const replayed = replayedHistoryMatch(built, lastHistoryScreen, event);
			if (replayed) {
				built.splice(built.indexOf(replayed), 1);
				const [board, ...revisits] = replayed.sources;
				open.scoreboard = board!;
				open.revisits = revisits;
				vote(open.stageVotes, (board!.data as ScoreboardData).stage);
			}
		} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			if (HISTORY_SCOREBOARD_EVENT_TYPES.includes(event.type)) {
				lastHistoryScreen = event;
			}
			const revisited =
				revisitedMatch(built, event) ??
				(open ? undefined : reshownResultsMatch(built, event));
			if (revisited) {
				// the game already has its match, and the one being played (if
				// any) keeps gathering events
				built[built.indexOf(revisited)] = {
					...revisited,
					sources: [...revisited.sources, event],
				};
				continue;
			}
			if (isStagelessHistoryRead(event)) continue;
			const missedResults =
				!open || isHistoryOfAnotherGame(event, open)
					? scoreboardlessMatchShown(scoreboardless, event)
					: undefined;
			if (missedResults) {
				const pending = scoreboardless.get(missedResults)!;
				pending.scoreboard = event;
				vote(pending.stageVotes, (event.data as ScoreboardData).stage);
				built[built.indexOf(missedResults)] = cachedBuiltMatch(
					pending,
					cache,
					event,
				);
				scoreboardless.delete(missedResults);
				continue;
			}
			const closing: OpenMatch<E> = open ?? claimOrphans(event.t);
			if (isHistoryOfAnotherGame(event, closing)) {
				// the log shows another game: the one being gathered stays open
				const shown = startMatch<E>();
				shown.scoreboard = event;
				vote(shown.stageVotes, (event.data as ScoreboardData).stage);
				built.push(cachedBuiltMatch(shown, cache));
				continue;
			}
			open = closing;
			// a replay played back from its browser entry ends on that entry again
			if (open.scoreboard) open.revisits.push(event);
			else open.scoreboard = event;
			vote(open.stageVotes, (event.data as ScoreboardData).stage);
			finalize();
			orphanDeaths = [];
			orphanObjectives = [];
			orphanPlayerStatuses = [];
			orphanStripWeapons = [];
			orphanKills = [];
			orphanXBattleCards = [];
		} else if (event.type === MINIMAP_EVENT_TYPE) {
			const stage = (event.data as MinimapData).stage;
			if (open) {
				// a stage change only splits when the next read doesn't refute it: a
				// lone disagreeing frame is a misread folded in as a minority vote.
				// An intro's stage outranks minimap reads: it holds until no later
				// read of this game shows it again (the next game's intro was missed)
				const lookahead = minimapLookahead.get(event)!;
				const introStage = open.mapStart
					? (open.mapStart.data as MapStartData).stage
					: null;
				const current = introStage ?? leadingStage(open.stageVotes);
				const stageChanged =
					current !== null &&
					stage !== null &&
					stage !== current &&
					(lookahead.nextStage ?? stage) === stage &&
					(introStage === null || !lookahead.laterStages.has(introStage));
				const gapTooBig =
					open.lastMinimapT !== null &&
					event.t - open.lastMinimapT > MATCH_GAP_SECONDS;
				if (stageChanged || gapTooBig) finalize();
			}
			open ??= startMatch();
			open.minimaps.push(event);
			open.lastMinimapT = event.t;
			vote(open.stageVotes, stage);
		} else if (event.type === DEATH_EVENT_TYPE) {
			(open?.deaths ?? orphanDeaths).push(event);
		} else if (event.type === OBJECTIVE_EVENT_TYPE) {
			(open?.objectives ?? orphanObjectives).push(event);
		} else if (event.type === PLAYER_STATUS_EVENT_TYPE) {
			(open?.playerStatuses ?? orphanPlayerStatuses).push(event);
		} else if (event.type === STRIP_WEAPONS_EVENT_TYPE) {
			(open?.stripWeapons ?? orphanStripWeapons).push(event);
		} else if (event.type === KILL_EVENT_TYPE) {
			(open?.kills ?? orphanKills).push(event);
		} else if (event.type === SCOREBOARD_OWN_EVENT_TYPE) {
			const completed = withOwnResults(built.at(-1), event);
			if (completed) built[built.length - 1] = completed;
		} else if (X_BATTLE_CARD_EVENT_TYPES.includes(event.type)) {
			// the lobby shows the cards before the game's results screen, so
			// they usually join the game still being gathered
			if (open) {
				open.xBattleCards.push(event);
			} else {
				const reported = withXBattleCard(built.at(-1), event);
				if (reported) built[built.length - 1] = reported;
				else orphanXBattleCards.push(event);
			}
		}
	}
	finalize();
	dropOrphans();

	// a history screen of another game is built before the open match it interrupted
	return [...built, ...unbackedBuilt].sort(
		(a, b) => a.sources[0]!.t - b.sources[0]!.t,
	);
}

/**
 * The personal results screen shows the POV player's full gear (mains and
 * subs), which no other screen reads whole: it completes that player's build
 * on the match whose scoreboard it follows. Returns that match completed, as
 * a copy; undefined when the screen belongs to none.
 */
function withOwnResults<E extends DetectedEvent>(
	last: BuiltMatch<E> | undefined,
	event: E,
): BuiltMatch<E> | undefined {
	const pov = last?.match.pov;
	if (!last || !pov || last.match.endsAt === null) return undefined;
	if (event.t - last.match.endsAt > OWN_RESULTS_WINDOW_SECONDS)
		return undefined;
	const data = event.data as ScoreboardOwnData;
	const team = last.match.teams[pov.team];
	const player = team.players[pov.index];
	if (!player || data.abilities.length === 0) return undefined;
	const teams = [...last.match.teams] as ScannerMatch["teams"];
	teams[pov.team] = {
		...team,
		players: team.players.with(pov.index, {
			...player,
			abilities: data.abilities,
		}),
	};
	return {
		match: { ...last.match, teams },
		sources: [...last.sources, event],
	};
}

/**
 * An X Battle lobby card seen with no game open joins the match closed
 * shortly before it, as a copy with the card in its sources (and an unread
 * lobby read as X Battle). Undefined when
 * no X Battle game (or one of unread lobby) closed shortly before it.
 */
function withXBattleCard<E extends DetectedEvent>(
	last: BuiltMatch<E> | undefined,
	event: E,
): BuiltMatch<E> | undefined {
	if (!last || last.match.endsAt === null || isHistoryOnly(last)) {
		return undefined;
	}
	if (last.match.lobby !== null && last.match.lobby !== "X") return undefined;
	if (event.t - last.match.endsAt > X_BATTLE_CARDS_WINDOW_SECONDS) {
		return undefined;
	}
	return {
		...last,
		match: { ...last.match, lobby: last.match.lobby ?? "X" },
		sources: [...last.sources, event],
	};
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
export function isHistoryOnly<E extends DetectedEvent>(
	built: BuiltMatch<E>,
): boolean {
	return built.sources.every((event) =>
		HISTORY_SCOREBOARD_EVENT_TYPES.includes(event.type),
	);
}

/**
 * Objective-counter reads on a match whose detected mode rules their overlay
 * out — lookalike misreads the builder already left out of the match's
 * `objective` — plus, on a mode with no counter overlay (Turf War), the
 * player-status and strip-weapon reads riding along with them.
 * Callers should delete these from their stores. A match with no mode read
 * yet loses nothing: its minority overlay is only left out of the build.
 */
export function invalidObjectiveEvents<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
): E[] {
	return built.flatMap(({ match, sources }) => {
		if (match.mode === null) return [];
		const kind = matchCounterKind(match.mode, []);
		return sources.filter((event) => {
			if (event.type === OBJECTIVE_EVENT_TYPE) {
				return counterKindOfRead(event.data as ObjectiveData) !== kind;
			}
			return (
				kind === null &&
				(event.type === PLAYER_STATUS_EVENT_TYPE ||
					event.type === STRIP_WEAPONS_EVENT_TYPE)
			);
		});
	});
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
	const clockSeconds =
		match.mode === "TW" ? TURF_WAR_CLOCK_SECONDS : RANKED_CLOCK_SECONDS;
	return match.endsAt - intro.t < clockSeconds;
}

function isPlayedGame(sources: readonly DetectedEvent[]): boolean {
	return sources.some(
		(event) => !HISTORY_SCOREBOARD_EVENT_TYPES.includes(event.type),
	);
}

/** A match being accumulated as the timeline is walked. */
interface OpenMatch<E extends DetectedEvent> {
	mapStart: E | null;
	minimaps: E[];
	deaths: E[];
	/** objective-counter reads; become the match's `objective` samples */
	objectives: E[];
	/** icon-strip reads; become the match's `playerStatus` samples */
	playerStatuses: E[];
	/** sampled per-slot weapon evidence for the slot→row assignment */
	stripWeapons: E[];
	/** kill-feed stack reads; become the match's `kills` */
	kills: E[];
	/** X Battle lobby cards reporting on this game; ride along in its sources */
	xBattleCards: E[];
	/** the board a replay was played back from, or the results screen that closed the game */
	scoreboard: E | null;
	/** history screens showing the game again; ride along in its sources */
	revisits: E[];
	/**
	 * per-stage read counts (a MapStart's stage seeds it); without an intro
	 * stage the plurality winner delimits same-vs-next map so one misread frame
	 * can't poison the match
	 */
	stageVotes: Map<StageId, number>;
	lastMinimapT: number | null;
}

function isBacked<E extends DetectedEvent>(open: OpenMatch<E>): boolean {
	return (
		open.scoreboard !== null ||
		open.minimaps.length > 0 ||
		hasPlayedCounter(open)
	);
}

/** An intro followed by counter reads spanning a stretch of game clock: the game was played, results screen or not. */
function hasPlayedCounter<E extends DetectedEvent>(
	open: OpenMatch<E>,
): boolean {
	const first = open.objectives[0];
	const last = open.objectives.at(-1);
	return (
		open.mapStart !== null &&
		first !== undefined &&
		last!.t - first.t >= MIN_PLAYED_COUNTER_SECONDS
	);
}

function startMatch<E extends DetectedEvent>(): OpenMatch<E> {
	return {
		mapStart: null,
		minimaps: [],
		deaths: [],
		objectives: [],
		playerStatuses: [],
		stripWeapons: [],
		kills: [],
		xBattleCards: [],
		scoreboard: null,
		revisits: [],
		stageVotes: new Map(),
		lastMinimapT: null,
	};
}

interface MinimapLookahead {
	/** the next minimap's non-null stage read */
	nextStage: StageId | null;
	/** stages read by later minimaps before the next intro, scoreboard or time gap */
	laterStages: ReadonlySet<StageId>;
}

/**
 * For each minimap event, what the minimaps after it read — the refutation
 * signals for the stage-change split.
 */
function buildMinimapLookahead<E extends DetectedEvent>(
	sorted: readonly E[],
): Map<E, MinimapLookahead> {
	const lookahead = new Map<E, MinimapLookahead>();
	let nextStage: StageId | null = null;
	let laterStages = new Set<StageId>();
	let laterMinimapT: number | null = null;
	for (let i = sorted.length - 1; i >= 0; i--) {
		const event = sorted[i]!;
		if (
			event.type === MAP_START_EVENT_TYPE ||
			SCOREBOARD_EVENT_TYPES.includes(event.type)
		) {
			laterStages = new Set();
			continue;
		}
		if (event.type !== MINIMAP_EVENT_TYPE) continue;
		if (laterMinimapT !== null && laterMinimapT - event.t > MATCH_GAP_SECONDS) {
			laterStages = new Set();
		}
		lookahead.set(event, { nextStage, laterStages });
		const stage = (event.data as MinimapData).stage;
		if (stage !== null && !laterStages.has(stage)) {
			// copied so the sets already handed out keep what they saw
			laterStages = new Set(laterStages).add(stage);
		}
		nextStage = stage ?? nextStage;
		laterMinimapT = event.t;
	}
	return lookahead;
}

function vote(votes: Map<StageId, number>, stage: StageId | null): void {
	if (stage !== null) votes.set(stage, (votes.get(stage) ?? 0) + 1);
}

/** Plurality stage of the reads so far; insertion order breaks ties. */
function leadingStage(votes: Map<StageId, number>): StageId | null {
	let winner: StageId | null = null;
	let best = 0;
	for (const [stage, count] of votes) {
		if (count > best) {
			winner = stage;
			best = count;
		}
	}
	return winner;
}

/** The open match's events in a fixed order; equal lists mean the same match. */
function openMatchInputs<E extends DetectedEvent>(open: OpenMatch<E>): E[] {
	return [
		...(open.mapStart ? [open.mapStart] : []),
		...open.minimaps,
		...open.deaths,
		...open.objectives,
		...open.playerStatuses,
		...open.stripWeapons,
		...open.kills,
		...open.xBattleCards,
		...(open.scoreboard ? [open.scoreboard] : []),
		...open.revisits,
	];
}

function cachedBuiltMatch<E extends DetectedEvent>(
	open: OpenMatch<E>,
	cache: MatchBuildCache<E> | undefined,
	// an amended match's own key, so the match as first built stays cached too
	key?: E,
): BuiltMatch<E> {
	if (!cache) return toBuiltMatch(open);
	const inputs = openMatchInputs(open);
	const cacheKey = key ?? inputs[0]!;
	const cached = cache.get(cacheKey);
	if (
		cached &&
		cached.inputs.length === inputs.length &&
		cached.inputs.every((event, index) => event === inputs[index])
	) {
		return cached.built;
	}
	const built = toBuiltMatch(open);
	cache.set(cacheKey, { inputs, built });
	return built;
}

function toBuiltMatch<E extends DetectedEvent>(
	open: OpenMatch<E>,
): BuiltMatch<E> {
	const sources = openMatchInputs(open).sort((a, b) => a.t - b.t);

	const board = open.scoreboard?.data as ScoreboardData | undefined;
	const start = open.mapStart?.data as MapStartData | undefined;
	const deaths = open.deaths.map((event) => event.data as DeathData);
	const objectives = open.objectives.map((event) => ({
		t: event.t,
		data: event.data as ObjectiveData,
	}));
	const playerStatuses = open.playerStatuses.map((event) => ({
		t: event.t,
		data: event.data as PlayerStatusData,
	}));
	const stripWeapons = open.stripWeapons.map((event) => ({
		t: event.t,
		data: event.data as StripWeaponsData,
	}));
	const minimapReads = open.minimaps.map((event) => ({
		t: event.t,
		data: event.data as MinimapData,
	}));
	const killReads = open.kills.map((event) => ({
		t: event.t,
		data: event.data as KillData,
	}));
	const minimaps = minimapReads.map((read) => read.data);

	const mode = matchMode(board?.mode ?? null, start?.mode ?? null);
	// reads of the overlay the mode doesn't draw are lookalike misreads, and on
	// a mode with no parsed overlay the statuses riding along with them go too.
	// Minimap card states and the kill feed are mode-agnostic and feed their
	// samples regardless
	const counterKind = matchCounterKind(
		mode,
		objectives.map((read) => read.data),
	);
	const counterReads = objectives.filter(
		(read) => counterKindOfRead(read.data) === counterKind,
	);
	const statusesValid = counterKind !== null || mode === null;
	const progress = buildProgress(
		counterReads,
		counterKind === null
			? null
			: objectiveMode(
					counterKind,
					mode,
					counterReads.map((read) => read.data),
				),
		statusesValid ? playerStatuses : [],
		statusesValid ? stripWeapons : [],
		minimapReads,
		killReads,
		board,
		minimapTeamColors(minimaps),
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
		playedAt: playedAt(open.scoreboard),
		// only X Battle shows its lobby cards: they tell a game whose results
		// screen was missed (or its header unread) apart from other lobbies
		lobby: board?.lobby ?? (open.xBattleCards.length > 0 ? "X" : null),
		mode,
		stage: board?.stage ?? start?.stage ?? leadingStage(open.stageVotes),
		matchScores: board?.matchScores.some((score) => score !== null)
			? board.matchScores
			: null,
		replayCode: historyData(open.scoreboard)?.replayCode ?? null,
		// layout alone cannot flag a broadcast (S3 POV footage draws both narrow
		// strip geometries), so only the spectator map screen or badge-proven
		// strips count; a results screen that identified the POV seat disproves
		// them all — casts never see one
		cast:
			pov === null &&
			(open.minimaps.some((event) => (event.data as MinimapData).spectator) ||
				playerStatuses.some((read) => read.data.cast)),
		objective: progress.objective,
		playerStatus: progress.playerStatus,
		kills: progress.kills,
		teams: board
			? teamsFromScoreboard(board, deaths, minimaps, progress.minimapEnemySide)
			: teamsFromMinimaps(mostConfidentFirst(open.minimaps), deaths),
		winner: board ? 0 : null,
		pov,
	};

	return isBacked(open)
		? { match, sources }
		: { match, sources, unbacked: true };
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
 * HUD intact, so both series are anchored by projected clock zero (`t + time`)
 * against one shared dominant projection and reads off it are dropped;
 * timerless reads follow their preceding anchored neighbor. A displayed count
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
 * Within a side the strip's slot order is the lobby seating while a results
 * scoreboard re-sorts rows per game (attested in the sendou-triton VoD), so on
 * a scoreboard-closed match each side's slots are reordered into row order via
 * slot-row-assignment.ts: weapon votes from StripWeapons evidence plus the
 * minimap's card columns (mirror the strip seating; attested for the enemy
 * column, own column assumed symmetric). The POV diamond follows neither
 * order, so its flags map by card name and stay as drawn when too few names
 * resolve. A minimap-grouped match's samples stay as drawn by construction.
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
): {
	objective: ScannerMatchObjective | null;
	playerStatus: ScannerMatchPlayerStatus | null;
	kills: ScannerMatchKill[] | null;
	/** the `teams` side the minimap's enemy column is; null with no scoreboard */
	minimapEnemySide: 0 | 1 | null;
} {
	const dominant = dominantAnchorOf([
		...objectives,
		...playerStatuses,
		...killReads,
	]);
	const live = withoutReplayReads(objectives, dominant);
	const liveKills = withoutReplayReads(killReads, dominant);
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
	const liveStatuses = withoutReplayReads(statusReads, dominant);

	const clusterHues = seedClusterHues(live);
	const swapFlags = readSwapFlags(live, clusterHues);
	const oriented = withMonotonicScores(orientObjectives(live, swapFlags));

	const swap = board
		? board.povIndex !== null
			? board.povIndex >= PLAYERS_PER_TEAM
			: bestCount(oriented, 1) < bestCount(oriented, 0)
		: minimapAnchorSwap(clusterHues, minimapColors);
	const minimapSwapped = swap !== minimapAnchorSwap(clusterHues, minimapColors);

	const perms = board
		? slotRowPermutations(
				board,
				stripWeapons,
				minimapReads,
				live,
				swapFlags,
				swap,
				minimapSwapped,
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
					samples: withShortSpecialGapsBridged(
						withImpossibleDeadRunsFlipped(
							liveStatuses.map((read): ScannerMatchPlayerStatusSample => {
								const swapped = read.fromMinimap
									? minimapSwapped
									: nearestSwapFlag(live, swapFlags, read.t) !== swap;
								const [a, b] = swapped ? ([1, 0] as const) : ([0, 1] as const);
								const arrange = (
									flags: readonly [PlayerStatusFlags, PlayerStatusFlags],
								): [PlayerStatusFlags, PlayerStatusFlags] =>
									[a, b].map((source, side) =>
										applyPermutation(
											flags[source]!,
											readPermutation(perms, read, source, side as 0 | 1),
										),
									) as [PlayerStatusFlags, PlayerStatusFlags];
								return {
									t: Math.max(0, Math.floor(read.t)),
									time: read.data.time,
									special: specialChargeable(
										read.data.time ??
											(dominant === null ? null : dominant - read.t),
									)
										? arrange(read.data.special)
										: noSpecialsReady(),
									dead: arrange(read.data.dead),
								};
							}),
						),
					),
				};

	return {
		objective,
		playerStatus,
		kills: liveKills.length === 0 ? null : deriveKills(liveKills),
		minimapEnemySide: board ? (minimapSwapped ? 0 : 1) : null,
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
	const ka = matchKey(a);
	const kb = matchKey(b);
	const similarity =
		1 - editDistance(ka, kb) / Math.max(ka.length, kb.length, 1);
	return similarity >= KILL_SAME_ROW_MIN_SIMILARITY;
}

/** The slot→row permutations of a scoreboard-closed match, per source. */
interface SlotRowPerms {
	/** per teams side, for strip-seated slots (the strip and card columns) */
	strip: [SlotRowPermutation, SlotRowPermutation];
	/** for the POV diamond's teammate flags; null = keep as drawn */
	diamond: SlotRowPermutation | null;
}

/**
 * One minimap card's parsed weapon next to raw strip NCC scores (~0.3-0.6 per
 * candidate per read): the card parser is gated on a clean read, so one card
 * outweighs a single strip sample without drowning a match's worth of them.
 */
const MINIMAP_CARD_VOTE = 1;

/**
 * Accumulates the match's weapon votes (strip evidence oriented read-by-read,
 * minimap cards through the minimap anchor) and solves each side's slot→row
 * assignment against the scoreboard's weapons, plus the diamond's name-based one.
 */
function slotRowPermutations(
	board: ScoreboardData,
	stripWeapons: readonly { t: number; data: StripWeaponsData }[],
	minimapReads: readonly { t: number; data: MinimapData }[],
	live: readonly { t: number; data: ObjectiveData }[],
	swapFlags: readonly boolean[],
	swap: boolean,
	minimapSwapped: boolean,
): SlotRowPerms {
	const votes: Map<MainWeaponId, number>[][] = [0, 1].map(() =>
		[0, 1, 2, 3].map(() => new Map<MainWeaponId, number>()),
	);
	const addVote = (
		side: 0 | 1,
		slot: number,
		weaponId: MainWeaponId,
		score: number,
	): void => {
		const slotVotes = votes[side]![slot]!;
		slotVotes.set(weaponId, (slotVotes.get(weaponId) ?? 0) + score);
	};

	for (const read of stripWeapons) {
		const swapped = nearestSwapFlag(live, swapFlags, read.t) !== swap;
		for (const side of [0, 1] as const) {
			const source = swapped ? ((1 - side) as 0 | 1) : side;
			for (const [slot, candidates] of read.data.slots[source].entries()) {
				for (const candidate of candidates ?? []) {
					addVote(side, slot, candidate.weaponId, candidate.score);
				}
			}
		}
	}

	// enemy cards mirror the strip seating (attested); the spectator
	// screen's own column is assumed symmetric. The POV diamond is not
	// strip-seated and votes for nothing.
	const enemySide = minimapSwapped ? 0 : 1;
	for (const read of minimapReads) {
		for (const [slot, enemy] of read.data.enemies.entries()) {
			if (enemy.weaponId !== null) {
				addVote(enemySide, slot, enemy.weaponId, MINIMAP_CARD_VOTE);
			}
		}
		if (!read.data.spectator) continue;
		for (const [slot, mate] of read.data.teammates.entries()) {
			if (mate.weaponId !== null) {
				addVote(
					(1 - enemySide) as 0 | 1,
					slot,
					mate.weaponId,
					MINIMAP_CARD_VOTE,
				);
			}
		}
	}

	const rowWeapons = (side: 0 | 1) =>
		board.players
			.slice(side * PLAYERS_PER_TEAM, (side + 1) * PLAYERS_PER_TEAM)
			.map((player) => player.weaponId);
	const strip = [0, 1].map((side) =>
		weaponSlotRowPermutation(votes[side]!, rowWeapons(side as 0 | 1)),
	) as [SlotRowPermutation, SlotRowPermutation];

	const friendlySide = minimapSwapped ? 1 : 0;
	const cardNames: string[][] = [[], [], [], []];
	for (const read of minimapReads) {
		if (read.data.spectator) continue;
		for (const [slot, mate] of read.data.teammates.entries()) {
			const name = mate.name?.trim();
			if (name) cardNames[slot]!.push(name);
		}
	}
	const diamond = cardNames.some((names) => names.length > 0)
		? nameSlotRowPermutation(
				cardNames,
				board.players
					.slice(
						friendlySide * PLAYERS_PER_TEAM,
						(friendlySide + 1) * PLAYERS_PER_TEAM,
					)
					.map((player) => player.name.trim() || null),
			)
		: null;

	return { strip, diamond };
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

/**
 * Debounces per-slot dead flags: an interior run whose flanking opposite-state
 * reads sit closer than the state could have held (DEAD/ALIVE_RUN_MIN_SECONDS)
 * is a misread blip (background ink through a translucent splatted icon, a box
 * over a mid-animation icon) and takes the flanking state. Edge runs stay —
 * nothing attests what came before or after the match window.
 */
function withImpossibleDeadRunsFlipped(
	samples: ScannerMatchPlayerStatusSample[],
): ScannerMatchPlayerStatusSample[] {
	let smoothed = samples;
	for (const side of [0, 1] as const) {
		for (let slot = 0; slot < PLAYERS_PER_TEAM; slot++) {
			// flipping one blip can expose the next (alternating flicker), so
			// each slot's series is re-swept until it settles
			let changed = true;
			while (changed) {
				changed = false;
				const series = smoothed.map((sample) => sample.dead[side][slot]);
				let runStart = 0;
				for (let i = 1; i <= series.length; i++) {
					if (i < series.length && series[i] === series[runStart]) continue;
					const interior = runStart > 0 && i < series.length;
					const impossiblyShort =
						interior &&
						smoothed[i]!.t - smoothed[runStart - 1]!.t <=
							(series[runStart] ? DEAD_RUN_MIN_SECONDS : ALIVE_RUN_MIN_SECONDS);
					if (impossiblyShort) {
						if (smoothed === samples) {
							smoothed = samples.map((sample) => ({
								...sample,
								dead: [[...sample.dead[0]], [...sample.dead[1]]] as [
									PlayerStatusFlags,
									PlayerStatusFlags,
								],
							}));
						}
						for (let j = runStart; j < i; j++) {
							smoothed[j]!.dead[side][slot] = !series[runStart];
						}
						changed = true;
						break;
					}
					runStart = i;
				}
			}
		}
	}
	return smoothed;
}

/**
 * No special charges within SPECIAL_REGAIN_MIN_SECONDS of the clock starting
 * (or before it), so a ready read there is a misread (a pale backdrop behind
 * the icon, the spectator map's opening wipe) that would otherwise bridge into
 * the first real ready wash. Timerless reads take the clock the match's
 * dominant anchor projects; Turf War's shorter clock never reaches this window.
 */
function specialChargeable(time: number | null): boolean {
	return (
		time === null || time <= RANKED_CLOCK_SECONDS - SPECIAL_REGAIN_MIN_SECONDS
	);
}

function noSpecialsReady(): [PlayerStatusFlags, PlayerStatusFlags] {
	return [
		[false, false, false, false],
		[false, false, false, false],
	];
}

/**
 * Bridges per-slot special-ready gaps: an interior not-ready run whose flanking
 * ready reads sit closer than SPECIAL_REGAIN_MIN_SECONDS, with no death inside
 * to explain the loss, is a misread gap (the ready wash's dim pulse trough) and
 * reads ready throughout. Short READY runs stay (a fresh special really can be
 * spent within a read or two), as do edge runs.
 */
function withShortSpecialGapsBridged(
	samples: ScannerMatchPlayerStatusSample[],
): ScannerMatchPlayerStatusSample[] {
	let bridged = samples;
	for (const side of [0, 1] as const) {
		for (let slot = 0; slot < PLAYERS_PER_TEAM; slot++) {
			const series = samples.map((sample) => sample.special[side][slot]);
			let runStart = 0;
			for (let i = 1; i <= series.length; i++) {
				if (i < series.length && series[i] === series[runStart]) continue;
				const interiorGap =
					!series[runStart] && runStart > 0 && i < series.length;
				const impossiblyShort =
					interiorGap &&
					samples[i]!.t - samples[runStart - 1]!.t < SPECIAL_REGAIN_MIN_SECONDS;
				const diedInside =
					interiorGap &&
					samples.slice(runStart, i).some((sample) => sample.dead[side][slot]);
				if (impossiblyShort && !diedInside) {
					if (bridged === samples) {
						bridged = samples.map((sample) => ({
							...sample,
							special: [[...sample.special[0]], [...sample.special[1]]] as [
								PlayerStatusFlags,
								PlayerStatusFlags,
							],
						}));
					}
					for (let j = runStart; j < i; j++) {
						bridged[j]!.special[side][slot] = true;
					}
				}
				runStart = i;
			}
		}
	}
	return bridged;
}

/** A status read from either source, sides as read (pre-orientation). */
interface StatusRead {
	t: number;
	/** minimap sides are own/enemy — camera-stable, unlike the HUD plates */
	fromMinimap: boolean;
	/** minimap reads only: the 8-card spectator screen, whose own column is card-seated like the enemy one — the POV diamond is not (see readPermutation) */
	spectator?: boolean;
	data: {
		time: number | null;
		special: [PlayerStatusFlags, PlayerStatusFlags];
		dead: [PlayerStatusFlags, PlayerStatusFlags];
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
					special: [
						sideFlags(teammates, "specialReady"),
						sideFlags(enemies, "specialReady"),
					],
					dead: [sideFlags(teammates, "dead"), sideFlags(enemies, "dead")],
				},
			},
		];
	});
}

function sideFlags(
	players: readonly { dead: boolean; specialReady: boolean }[],
	key: "dead" | "specialReady",
): PlayerStatusFlags {
	return [0, 1, 2, 3].map(
		(slot) => players[slot]?.[key] ?? false,
	) as PlayerStatusFlags;
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
 * The dominant clock-zero projection across every timed read; null when none.
 * Counter and status reads project the same clock, so one anchor voids both.
 */
function dominantAnchorOf(
	reads: readonly { t: number; data: { time: number | null } }[],
): number | null {
	const anchors = reads.flatMap((read) =>
		read.data.time !== null ? [read.t + read.data.time] : [],
	);
	return anchors.length === 0 ? null : dominantAnchor(anchors);
}

/**
 * Drops reads taken off broadcast replay wipes: `t + time` projects the moment
 * the match timer hits zero, constant across a live game but far off when the
 * broadcast re-runs an earlier moment. Only reads near the dominant projection
 * (the live series outnumbers ~30s replay clips) are kept; a timerless read
 * shares the fate of its preceding anchored neighbor (the following one for a
 * timerless head), so an unreadable timer never voids live reads.
 */
function withoutReplayReads<
	T extends { t: number; data: { time: number | null } },
>(reads: readonly T[], dominant: number | null): T[] {
	if (dominant === null) return [...reads];
	const anchored = reads.flatMap((read, i) =>
		read.data.time !== null ? [{ i, anchor: read.t + read.data.time }] : [],
	);
	if (anchored.length === 0) return [...reads];

	const keptAnchored = new Map(
		anchored.map(({ i, anchor }) => [
			i,
			Math.abs(anchor - dominant) <= REPLAY_ANCHOR_TOLERANCE_SECONDS,
		]),
	);

	let previousKept = keptAnchored.get(anchored[0]!.i)!;
	return reads.filter((_, i) => {
		previousKept = keptAnchored.get(i) ?? previousKept;
		return previousKept;
	});
}

/** The clock-zero projection supported by the most reads within tolerance. */
function dominantAnchor(anchors: readonly number[]): number {
	const sorted = anchors.toSorted((a, b) => a - b);
	let best = sorted[0]!;
	let bestRunLength = 0;
	let lo = 0;
	for (let hi = 0; hi < sorted.length; hi++) {
		while (sorted[hi]! - sorted[lo]! > REPLAY_ANCHOR_TOLERANCE_SECONDS) lo++;
		if (hi - lo + 1 > bestRunLength) {
			bestRunLength = hi - lo + 1;
			best = sorted[Math.floor((lo + hi) / 2)]!;
		}
	}
	return best;
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
 * When the match was played: a replay/battle log screen's on-screen recording
 * timestamp (anchored to when the screen was seen, not a later send), else the
 * closing scoreboard's detection time — read structurally off richer event
 * records (StoredEvent) so the builder stays generic.
 */
function playedAt(scoreboard: DetectedEvent | null): number | null {
	if (!scoreboard) return null;
	return recordedAt(scoreboard) ?? detectedAtOf(scoreboard);
}

/** A history screen's on-screen recording time (the game's start, console clock); null when unread. */
function recordedAt(event: DetectedEvent): number | null {
	const timestamp = historyData(event)?.timestamp;
	if (!timestamp) return null;
	return parseReplayTimestamp(timestamp, {
		now: detectedAtOf(event) ?? undefined,
	});
}

function detectedAtOf(event: DetectedEvent): number | null {
	return (event as { detectedAt?: number }).detectedAt ?? null;
}

/** The replay-browser and both battle log screens carry the recording timestamp; only the former a replay code. */
function historyData(
	scoreboard: DetectedEvent | null,
):
	| (ScoreboardBattleLogData & Partial<ScoreboardBattleLogReplayData>)
	| undefined {
	if (!scoreboard || !HISTORY_SCOREBOARD_EVENT_TYPES.includes(scoreboard.type))
		return undefined;
	return scoreboard.data as ScoreboardBattleLogData &
		Partial<ScoreboardBattleLogReplayData>;
}

/**
 * The earlier match a battle history screen shows again: its closing board
 * shows the same game and its play time doesn't contradict the screen's
 * recording time (either may be unknown, e.g. on VoD scans).
 */
function revisitedMatch<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
	event: E,
): BuiltMatch<E> | undefined {
	if (!HISTORY_SCOREBOARD_EVENT_TYPES.includes(event.type)) return undefined;
	const board = event.data as ScoreboardData;
	const shownPlayedAt = playedAt(event);

	return built.findLast((candidate) => {
		if (!closesSameGame(candidate, board)) return false;
		return (
			shownPlayedAt === null ||
			candidate.match.playedAt === null ||
			Math.abs(shownPlayedAt - candidate.match.playedAt) <=
				REVISIT_PLAYED_AT_TOLERANCE_MS
		);
	});
}

/**
 * The history-only match a map intro plays back: the last history screen
 * before the intro was its replay-browser entry, shown at most
 * `REPLAY_LOAD_MAX_SECONDS` earlier, and the intro's stage (or with that
 * unread, its mode) agrees with the entry's.
 */
function replayedHistoryMatch<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
	lastHistoryScreen: E | null,
	intro: E,
): BuiltMatch<E> | undefined {
	if (
		lastHistoryScreen?.type !== SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE ||
		intro.t - lastHistoryScreen.t > REPLAY_LOAD_MAX_SECONDS
	) {
		return undefined;
	}
	const shown = built.findLast(
		(candidate) =>
			isHistoryOnly(candidate) && candidate.sources.includes(lastHistoryScreen),
	);
	if (!shown) return undefined;

	const { stage, mode } = intro.data as MapStartData;
	if (mode !== null && shown.match.mode !== null && mode !== shown.match.mode) {
		return undefined;
	}
	const agrees =
		stage !== null
			? stage === shown.match.stage
			: mode !== null && mode === shown.match.mode;
	return agrees ? shown : undefined;
}

/**
 * A history screen whose stage went unread names no game of its own (typically
 * a frame caught mid-transition), so it may only join an already built match.
 */
function isStagelessHistoryRead(event: DetectedEvent): boolean {
	return (
		HISTORY_SCOREBOARD_EVENT_TYPES.includes(event.type) &&
		(event.data as ScoreboardData).stage === null
	);
}

/**
 * Whether a history screen shows another game than the one `pending` holds the
 * reads of: the stage or mode its intro or minimaps read disagrees, or its
 * recording time is too far from when those reads were seen. Without such
 * evidence it closes the game, standing in for a missed results screen.
 */
function isHistoryOfAnotherGame<E extends DetectedEvent>(
	event: E,
	pending: OpenMatch<E>,
): boolean {
	if (!HISTORY_SCOREBOARD_EVENT_TYPES.includes(event.type)) return false;
	const board = event.data as ScoreboardData;
	const start = pending.mapStart?.data as MapStartData | undefined;

	const stage = start?.stage ?? leadingStage(pending.stageVotes);
	if (stage !== null && board.stage !== null && stage !== board.stage) {
		return true;
	}
	const mode = start?.mode ?? null;
	if (mode !== null && board.mode !== null && mode !== board.mode) return true;

	const recorded = recordedAt(event);
	const firstRead = firstReadAt(pending);
	if (recorded === null || firstRead === null) return false;
	return Math.abs(recorded - firstRead) > REVISIT_PLAYED_AT_TOLERANCE_MS;
}

/**
 * The earlier match a battle history screen completes, its results screen
 * missed: one finalized without a scoreboard whose reads the screen doesn't
 * contradict (`isHistoryOfAnotherGame`), the one first read closest to the
 * recording time. Without times to compare (VoD scans, an unread timestamp)
 * only a sole fitting match is taken.
 */
function scoreboardlessMatchShown<E extends DetectedEvent>(
	scoreboardless: ReadonlyMap<BuiltMatch<E>, OpenMatch<E>>,
	event: E,
): BuiltMatch<E> | undefined {
	if (!HISTORY_SCOREBOARD_EVENT_TYPES.includes(event.type)) return undefined;
	const fitting = [...scoreboardless].filter(
		([, pending]) => !isHistoryOfAnotherGame(event, pending),
	);

	const recorded = recordedAt(event);
	let closest: { match: BuiltMatch<E>; distance: number } | undefined;
	for (const [match, pending] of fitting) {
		const firstRead = firstReadAt(pending);
		if (recorded === null || firstRead === null) continue;
		const distance = Math.abs(recorded - firstRead);
		if (!closest || distance < closest.distance) closest = { match, distance };
	}
	if (closest) return closest.match;

	return fitting.length === 1 ? fitting[0]![0] : undefined;
}

/** When the earliest of the match's reads was seen (wall clock); null on VoD scans. */
function firstReadAt<E extends DetectedEvent>(
	pending: OpenMatch<E>,
): number | null {
	const readTimes = openMatchInputs(pending)
		.map(detectedAtOf)
		.filter((t) => t !== null);
	return readTimes.length > 0 ? Math.min(...readTimes) : null;
}

/**
 * The last match again when its results screen is read a second time with no
 * match opened since: an overlay (e.g. a lost-connection dialog) hid the screen
 * long enough for the detector to re-arm.
 */
function reshownResultsMatch<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
	event: E,
): BuiltMatch<E> | undefined {
	if (event.type !== SCOREBOARD_EVENT_TYPE) return undefined;
	const last = built.at(-1);
	if (!last) return undefined;
	return closesSameGame(last, event.data as ScoreboardData) ? last : undefined;
}

/**
 * Whether `board` shows the game `built` closed with: the stages don't
 * disagree and the boards share enough paint totals, order-free (a history
 * screen can misplace the winner panel). Paint totals practically never repeat
 * between games; names (OCR wobble) and weapons (icon sizes differ per screen)
 * are left out.
 */
function closesSameGame<E extends DetectedEvent>(
	built: BuiltMatch<E>,
	board: ScoreboardData,
): boolean {
	const closingBoard = built.sources.find((source) =>
		SCOREBOARD_EVENT_TYPES.includes(source.type),
	);
	if (!closingBoard) return false;
	if (
		board.stage !== null &&
		built.match.stage !== null &&
		board.stage !== built.match.stage
	) {
		return false;
	}
	return (
		multisetOverlap(
			paintsRead(closingBoard.data as ScoreboardData),
			paintsRead(board),
		) >= SAME_GAME_MIN_SHARED_PAINTS
	);
}

function paintsRead(board: ScoreboardData): number[] {
	return board.players.flatMap((player) =>
		player.paint !== null ? [player.paint] : [],
	);
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

function mostConfidentFirst(events: readonly DetectedEvent[]): MinimapData[] {
	return [...events]
		.sort((a, b) => b.confidence - a.confidence)
		.map((event) => event.data as MinimapData);
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

/** For each slot index, the first frame's non-null read of each field. */
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
			name:
				reads
					.map((read) => read.name?.trim() || null)
					.find((n) => n !== null) ?? null,
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
