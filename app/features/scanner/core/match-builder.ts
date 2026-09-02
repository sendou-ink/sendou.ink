/**
 * Groups a detected-event timeline into ScannerMatch objects
 * (scanner-match.ts). A MapStart opens a match, a scoreboard-type event
 * closes one, and deaths in between belong to it; a scoreboard with no
 * preceding MapStart claims the last 8 minutes of deaths. Without delimiters
 * (casted footage) minimaps group per map by stage change and time gap. A
 * match is emitted only when a scoreboard or minimaps back it, regardless of
 * lobby/outcome — `ingestSkipReasons` filters those. Deaths are harvested
 * onto player rows as enemy builds (ability-harvest.ts).
 */
import type {
	AbilityWithUnknown,
	MainWeaponId,
	StageId,
} from "~/modules/in-game-lists/types";
import {
	type GearMains,
	harvestAbilities,
	harvestCardMains,
} from "./ability-harvest";
import { DEATH_EVENT_TYPE, type DeathData } from "./detectors/death/index";
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
import { SCOREBOARD_EVENT_TYPES } from "./detectors/registry";
import type { ScoreboardData } from "./detectors/scoreboard/index";
import {
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
	type ScoreboardBattleLogData,
} from "./detectors/scoreboard-battle-log/index";
import {
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
	type ScoreboardBattleLogReplayData,
} from "./detectors/scoreboard-battle-log-replay/index";
import type { DetectedEvent } from "./detectors/types";
import { hueDistance, hueOf, type InkRgb } from "./ink-color";
import { parseReplayTimestamp } from "./replay-time";
import type {
	ScannerMatch,
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

/** The lobby header value private battles (tournament games) carry. */
const TOURNAMENT_LOBBY = "PRIVATE";

/** How far back a scoreboard with no MapStart claims deaths: matches run well under 8 min. */
const FALLBACK_WINDOW_SECONDS = 480;

/** Minimaps further apart than this cannot be the same game, even on the same stage. */
const MATCH_GAP_SECONDS = 300;

const PLAYERS_PER_TEAM = 4;

/**
 * Slack before calling a match a disconnect: a counter read is a snapshot of
 * moving numbers, and the results screen is read seconds after the last whistle.
 */
const EARLY_END_MARGIN_SECONDS = 10;

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
 * Regaining a used special takes at least this long (nothing charges off ~10s
 * of painting even with max Special Charge Up), so a not-ready run flanked by
 * ready reads closer than this, with no death inside, is a misread gap (the
 * ready wash pulses through a dim trough; overlays clip icons) and is bridged.
 */
const SPECIAL_REGAIN_MIN_SECONDS = 10;

export interface BuiltMatch<E extends DetectedEvent> {
	match: ScannerMatch;
	/** input events the match was built from, chronological — the send-status unit for callers */
	sources: E[];
}

/**
 * Splits a timeline into ScannerMatch objects, chronological. Event types that
 * identify no match (ScoreboardOwn) are ignored. Every input event ends up in
 * at most one match's `sources`.
 */
export function buildScannerMatches<E extends DetectedEvent>(
	events: readonly E[],
): BuiltMatch<E>[] {
	const sorted = events.toSorted((a, b) => a.t - b.t);
	const built: BuiltMatch<E>[] = [];
	const nextStage = buildNextStageMap(sorted);

	let open: OpenMatch<E> | null = null;
	// deaths/objective/status reads seen with no match open to anchor them yet
	let orphanDeaths: E[] = [];
	let orphanObjectives: E[] = [];
	let orphanPlayerStatuses: E[] = [];
	let orphanStripWeapons: E[] = [];
	const finalize = (): void => {
		if (!open) return;
		if (open.scoreboard || open.minimaps.length > 0) {
			built.push(toBuiltMatch(open));
		}
		open = null;
	};

	for (const event of sorted) {
		if (event.type === MAP_START_EVENT_TYPE) {
			// a new match intro abandons any match whose scoreboard was missed
			finalize();
			open = startMatch();
			open.mapStart = event;
			vote(open.stageVotes, (event.data as MapStartData).stage);
			orphanDeaths = [];
			orphanObjectives = [];
			orphanPlayerStatuses = [];
			orphanStripWeapons = [];
		} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			if (!open) {
				open = startMatch();
				open.deaths = orphanDeaths.filter(
					(death) => event.t - death.t <= FALLBACK_WINDOW_SECONDS,
				);
				open.objectives = orphanObjectives.filter(
					(objective) => event.t - objective.t <= FALLBACK_WINDOW_SECONDS,
				);
				open.playerStatuses = orphanPlayerStatuses.filter(
					(status) => event.t - status.t <= FALLBACK_WINDOW_SECONDS,
				);
				open.stripWeapons = orphanStripWeapons.filter(
					(read) => event.t - read.t <= FALLBACK_WINDOW_SECONDS,
				);
			}
			open.scoreboard = event;
			vote(open.stageVotes, (event.data as ScoreboardData).stage);
			finalize();
			orphanDeaths = [];
			orphanObjectives = [];
			orphanPlayerStatuses = [];
			orphanStripWeapons = [];
		} else if (event.type === MINIMAP_EVENT_TYPE) {
			const stage = (event.data as MinimapData).stage;
			if (open) {
				// a stage change only splits when the next read doesn't refute it: a
				// lone disagreeing frame is a misread folded in as a minority vote
				const current = leadingStage(open.stageVotes);
				const stageChanged =
					current !== null &&
					stage !== null &&
					stage !== current &&
					(nextStage.get(event) ?? stage) === stage;
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
		}
	}
	finalize();

	return built;
}

/** Why a built match is held back from /ingest; absent = it is sent. */
export type IngestSkipReason =
	/** not a tournament (Private Battle) game */
	| "lobby"
	/** a disconnect ended it before it could be decided */
	| "disconnect";

/**
 * Which built matches are not worth sending to /ingest, and why: non-tournament
 * lobbies (unread lobbies get the benefit of the doubt), and games a disconnect
 * cut short — counter reads show the game couldn't have ended on its own
 * (`endedEarly`), or the same map/mode was replayed right after with a score.
 * Replay evidence only arrives after the fact, so a live scan may already have
 * sent the abandoned game; the counter-read check catches it in the moment.
 */
export function ingestSkipReasons<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
): Map<BuiltMatch<E>, IngestSkipReason> {
	const reasons = new Map<BuiltMatch<E>, IngestSkipReason>();
	for (const [index, candidate] of built.entries()) {
		const { match } = candidate;
		if (match.lobby !== null && match.lobby !== TOURNAMENT_LOBBY) {
			reasons.set(candidate, "lobby");
		} else if (endedEarly(match) || wasReplayed(built, index)) {
			reasons.set(candidate, "disconnect");
		}
	}
	return reasons;
}

/**
 * Objective-counter, player-status and strip-weapon reads on a match whose
 * detected mode is not Splat Zones — the SZ parser (the only one so far)
 * misreading another mode's overlay. The builder already leaves such a match's
 * `objective`/`playerStatus` null; callers should delete these from their stores.
 */
export function invalidObjectiveEvents<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
): E[] {
	return built
		.filter((b) => b.match.mode !== null && b.match.mode !== "SZ")
		.flatMap((b) =>
			b.sources.filter(
				(event) =>
					event.type === OBJECTIVE_EVENT_TYPE ||
					event.type === PLAYER_STATUS_EVENT_TYPE ||
					event.type === STRIP_WEAPONS_EVENT_TYPE,
			),
		);
}

/**
 * A disconnect ended the match before it was decided: a results screen with no
 * score, and the last counter read still needed more game than the footage
 * gave it — a game ends no sooner than the clock running out or the lower
 * counter falling to zero at its 1/s cap (penalty worked off first).
 */
function endedEarly(match: ScannerMatch): boolean {
	// no results screen at all: an unfinished scan, not an unfinished game
	if (match.winner === null) return false;
	if (match.matchScores !== null) return false;
	const lastSample = match.objective?.samples.at(-1);
	if (!lastSample || match.endsAt === null) return false;

	const soonestEnd = secondsUntilSoonestEnd(lastSample);
	if (soonestEnd === null) return false;

	const secondsLeftInFootage = match.endsAt - lastSample.t;
	return soonestEnd - secondsLeftInFootage > EARLY_END_MARGIN_SECONDS;
}

function secondsUntilSoonestEnd(
	sample: ScannerMatchObjectiveSample,
): number | null {
	const knockouts = sample.score.map((score, team) =>
		score === null ? null : score + (sample.penalty[team] ?? 0),
	);
	const seconds = [sample.time, ...knockouts].filter(
		(value): value is number => value !== null,
	);
	return seconds.length > 0 ? Math.min(...seconds) : null;
}

/**
 * Whether the scoreless match at `index` was played again right after: the
 * following matches on the same mode and stage are the same game restarted, so
 * one of them reaching a score means the earlier attempts were disconnects.
 * The run stops at the first other map.
 */
function wasReplayed<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
	index: number,
): boolean {
	const { match } = built[index]!;
	if (match.matchScores !== null) return false;
	if (match.mode === null || match.stage === null) return false;

	for (const later of built.slice(index + 1)) {
		if (later.match.mode !== match.mode || later.match.stage !== match.stage) {
			return false;
		}
		if (later.match.matchScores !== null) return true;
	}
	return false;
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
	scoreboard: E | null;
	/**
	 * per-stage read counts (a MapStart's stage seeds it); the plurality winner
	 * delimits same-vs-next map so one misread frame can't poison the match
	 */
	stageVotes: Map<StageId, number>;
	lastMinimapT: number | null;
}

function startMatch<E extends DetectedEvent>(): OpenMatch<E> {
	return {
		mapStart: null,
		minimaps: [],
		deaths: [],
		objectives: [],
		playerStatuses: [],
		stripWeapons: [],
		scoreboard: null,
		stageVotes: new Map(),
		lastMinimapT: null,
	};
}

/**
 * For each minimap event, the next minimap's non-null stage read — the
 * refutation signal for the stage-change split.
 */
function buildNextStageMap<E extends DetectedEvent>(
	sorted: readonly E[],
): Map<E, StageId | null> {
	const nextStage = new Map<E, StageId | null>();
	let carry: StageId | null = null;
	for (let i = sorted.length - 1; i >= 0; i--) {
		const event = sorted[i]!;
		if (event.type !== MINIMAP_EVENT_TYPE) continue;
		nextStage.set(event, carry);
		carry = (event.data as MinimapData).stage ?? carry;
	}
	return nextStage;
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

function toBuiltMatch<E extends DetectedEvent>(
	open: OpenMatch<E>,
): BuiltMatch<E> {
	const sources = [
		...(open.mapStart ? [open.mapStart] : []),
		...open.minimaps,
		...open.deaths,
		...open.objectives,
		...open.playerStatuses,
		...open.stripWeapons,
		...(open.scoreboard ? [open.scoreboard] : []),
	].sort((a, b) => a.t - b.t);

	const board = open.scoreboard?.data as ScoreboardData | undefined;
	const start = open.mapStart?.data as MapStartData | undefined;
	// the replay-browser and battle log screens both carry the recording
	// timestamp; only the former a replay code
	const timestamped =
		open.scoreboard?.type === SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE ||
		open.scoreboard?.type === SCOREBOARD_BATTLE_LOG_EVENT_TYPE
			? (open.scoreboard.data as ScoreboardBattleLogData &
					Partial<ScoreboardBattleLogReplayData>)
			: undefined;
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
	const minimaps = minimapReads.map((read) => read.data);

	const mode = board?.mode ?? start?.mode ?? null;
	// only the SZ counter is parsed: reads on a known other-mode match are
	// lookalike-overlay misreads (statuses ride along with counter reads).
	// Minimap card states are mode-agnostic and feed status samples regardless
	const counterModeValid = mode === null || mode === "SZ";
	const progress = buildProgress(
		counterModeValid ? objectives : [],
		counterModeValid ? playerStatuses : [],
		counterModeValid ? stripWeapons : [],
		minimapReads,
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
		endsAt: floorOrNull(open.scoreboard?.t ?? open.minimaps.at(-1)?.t),
		playedAt: playedAt(open.scoreboard, timestamped),
		lobby: board?.lobby ?? null,
		mode,
		stage: board?.stage ?? start?.stage ?? leadingStage(open.stageVotes),
		matchScores: board?.matchScores.some((score) => score !== null)
			? board.matchScores
			: null,
		replayCode: timestamped?.replayCode ?? null,
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
		teams: board
			? teamsFromScoreboard(board, deaths, minimaps, progress.minimapEnemySide)
			: teamsFromMinimaps(minimaps, deaths),
		winner: board ? 0 : null,
		pov,
	};

	return { match, sources };
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
 */
function buildProgress(
	objectives: readonly { t: number; data: ObjectiveData }[],
	playerStatuses: readonly { t: number; data: PlayerStatusData }[],
	stripWeapons: readonly { t: number; data: StripWeaponsData }[],
	minimapReads: readonly { t: number; data: MinimapData }[],
	board: ScoreboardData | undefined,
	minimapColors: [InkRgb | null, InkRgb | null] | null,
): {
	objective: ScannerMatchObjective | null;
	playerStatus: ScannerMatchPlayerStatus | null;
	/** the `teams` side the minimap's enemy column is; null with no scoreboard */
	minimapEnemySide: 0 | 1 | null;
} {
	const dominant = dominantAnchorOf([...objectives, ...playerStatuses]);
	const live = withoutReplayReads(objectives, dominant);
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
					mode: "SZ" as const,
					samples: oriented.map((read): ScannerMatchObjectiveSample => {
						const [a, b] = swap ? ([1, 0] as const) : ([0, 1] as const);
						return {
							t: Math.max(0, Math.floor(read.t)),
							time: read.time,
							score: [read.score[a], read.score[b]],
							penalty: [read.penalty[a], read.penalty[b]],
							control: [read.control[a], read.control[b]],
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
									special: arrange(read.data.special),
									dead: arrange(read.data.dead),
								};
							}),
						),
					),
				};

	return {
		objective,
		playerStatus,
		minimapEnemySide: board ? (minimapSwapped ? 0 : 1) : null,
	};
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
	const cardNames: (string | null)[] = [null, null, null, null];
	for (const read of minimapReads) {
		if (read.data.spectator) continue;
		for (const [slot, mate] of read.data.teammates.entries()) {
			cardNames[slot] ??= mate.name?.trim() || null;
		}
	}
	const diamond = cardNames.some((name) => name !== null)
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
	control: [boolean, boolean];
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
		return {
			t,
			time: data.time,
			score: [data.score[a], data.score[b]],
			penalty: [data.penalty[a], data.penalty[b]],
			control: [data.control[a], data.control[b]],
		};
	});
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
	let bestCount = 0;
	let lo = 0;
	for (let hi = 0; hi < sorted.length; hi++) {
		while (sorted[hi]! - sorted[lo]! > REPLAY_ANCHOR_TOLERANCE_SECONDS) lo++;
		if (hi - lo + 1 > bestCount) {
			bestCount = hi - lo + 1;
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
function playedAt(
	scoreboard: DetectedEvent | null,
	timestamped: ScoreboardBattleLogData | undefined,
): number | null {
	if (!scoreboard) return null;
	const detectedAt = (scoreboard as { detectedAt?: number }).detectedAt ?? null;
	if (timestamped?.timestamp) {
		const recorded = parseReplayTimestamp(timestamped.timestamp, {
			now: detectedAt ?? undefined,
		});
		if (recorded !== null) return recorded;
	}
	return detectedAt;
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
