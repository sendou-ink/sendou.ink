/**
 * Groups a detected-event timeline into ScannerMatch objects
 * (scanner-match.ts). A MapStart opens a match, a scoreboard-type event
 * closes one, and deaths in between belong to it; a scoreboard with no
 * preceding MapStart claims the last 8 minutes of deaths. Between delimiters
 * (casted footage has none) minimaps group per map by stage change and time
 * gap, since a Splatoon game runs a few minutes. A match is emitted only
 * when a scoreboard or minimaps back it (a MapStart with a missed results
 * screen identifies nothing), regardless of lobby/outcome —
 * `ingestSkipReasons` filters those. Deaths are harvested onto player rows
 * as enemy builds (ability-harvest.ts).
 */
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { harvestAbilities } from "./ability-harvest";
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
	ScannerMatchTeam,
} from "./scanner-match";

/** The lobby header value private battles (tournament games) carry. */
const TOURNAMENT_LOBBY = "PRIVATE";

/**
 * How far back a scoreboard with no preceding MapStart claims deaths as its
 * match — matches run well under 8 minutes, so anything older is another
 * (undelimited) match's.
 */
const FALLBACK_WINDOW_SECONDS = 480;

/**
 * Two minimaps more than this far apart cannot be the same game, so they
 * open separate matches even on the same stage.
 */
const MATCH_GAP_SECONDS = 300;

const PLAYERS_PER_TEAM = 4;

/**
 * Slack the ended-early check gives a match before calling it a disconnect:
 * a counter read is a snapshot of numbers that keep moving, and the results
 * screen is only read some seconds after the last whistle.
 */
const EARLY_END_MARGIN_SECONDS = 10;

/**
 * The two team-ink hues must be at least this far apart before color is
 * trusted to orient counter reads: a game's color pair is picked to
 * contrast (attested pairs measure >130° apart), so a closer seed pair is
 * a misread, and orientation falls back to the as-read arrangement.
 */
const MIN_TEAM_HUE_SEPARATION = 30;

export interface BuiltMatch<E extends DetectedEvent> {
	match: ScannerMatch;
	/**
	 * the input events the match was built from, chronological — the
	 * send-status unit for callers with richer event records (StoredEvent)
	 */
	sources: E[];
}

/**
 * Splits a timeline into ScannerMatch objects, chronological. Event types
 * that identify no match (ScoreboardOwn) are ignored. Every input event ends
 * up in at most one match's `sources` — orphan pools are cleared the moment
 * a boundary claims or invalidates them.
 */
export function buildScannerMatches<E extends DetectedEvent>(
	events: readonly E[],
): BuiltMatch<E>[] {
	const sorted = events.toSorted((a, b) => a.t - b.t);
	const built: BuiltMatch<E>[] = [];
	const nextStage = buildNextStageMap(sorted);

	let open: OpenMatch<E> | null = null;
	// deaths/objective reads seen with no match open to anchor them yet
	let orphanDeaths: E[] = [];
	let orphanObjectives: E[] = [];
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
		} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			if (!open) {
				open = startMatch();
				open.deaths = orphanDeaths.filter(
					(death) => event.t - death.t <= FALLBACK_WINDOW_SECONDS,
				);
				open.objectives = orphanObjectives.filter(
					(objective) => event.t - objective.t <= FALLBACK_WINDOW_SECONDS,
				);
			}
			open.scoreboard = event;
			vote(open.stageVotes, (event.data as ScoreboardData).stage);
			finalize();
			orphanDeaths = [];
			orphanObjectives = [];
		} else if (event.type === MINIMAP_EVENT_TYPE) {
			const stage = (event.data as MinimapData).stage;
			if (open) {
				// a stage change only splits when the next read doesn't refute
				// it: a lone disagreeing frame is a misread to fold in as a
				// minority vote, not a match boundary
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
 * Which built matches are not worth sending to /ingest, and why. Kept out:
 * non-tournament lobbies (unread lobbies get the benefit of the doubt), and
 * games a disconnect cut short — proven either by counter reads showing the
 * game couldn't have ended on its own (see `endedEarly`), or by the same
 * map/mode being replayed right after with a score. Replay evidence only
 * ever arrives after the fact, so a live scan may already have sent the
 * abandoned game before its replay is detected; the counter-read check is
 * what catches it in the moment.
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
 * Objective-counter reads that landed on a match whose detected mode is not
 * Splat Zones — the SZ parser (the only one so far) misreading another
 * mode's counter overlay. The builder already leaves such a match's
 * `objective` null; callers should delete these events from their stores.
 */
export function invalidObjectiveEvents<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
): E[] {
	return built
		.filter((b) => b.match.mode !== null && b.match.mode !== "SZ")
		.flatMap((b) =>
			b.sources.filter((event) => event.type === OBJECTIVE_EVENT_TYPE),
		);
}

/**
 * Whether a disconnect ended the match before it could be decided: it has a
 * results screen but no score on it, and its last counter read still needed
 * more game left than the footage gave it. From that read a game can end no
 * sooner than the clock running out, or the lower counter falling to zero at
 * its 1/s cap (a knockout) with any penalty worked off first — so when even
 * that came due after the match was already over, it was cut short.
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
 * run of matches following it on the same mode and stage is the same game
 * restarted, so one of them reaching a score means the earlier attempts
 * ended in a disconnect. The run stops at the first other map, which keeps
 * the same map coming up again later in the scan out of it.
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
	scoreboard: E | null;
	/**
	 * per-stage read counts (a MapStart's stage seeds it); the plurality
	 * winner delimits same-vs-next map so one misread frame can't poison
	 * the whole match
	 */
	stageVotes: Map<StageId, number>;
	/** t of the last minimap added, for the gap check */
	lastMinimapT: number | null;
}

function startMatch<E extends DetectedEvent>(): OpenMatch<E> {
	return {
		mapStart: null,
		minimaps: [],
		deaths: [],
		objectives: [],
		scoreboard: null,
		stageVotes: new Map(),
		lastMinimapT: null,
	};
}

/**
 * For each minimap event, the next minimap's non-null stage read (walked
 * backwards) — the refutation signal for the stage-change split.
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
	const minimaps = open.minimaps.map((event) => event.data as MinimapData);

	const mode = board?.mode ?? start?.mode ?? null;

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
		cast: open.minimaps.some((event) => (event.data as MinimapData).spectator),
		// only the SZ counter is parsed — reads on a known other-mode match
		// are misreads of a lookalike overlay, not progress data
		objective:
			mode === null || mode === "SZ"
				? buildObjective(objectives, board, minimapTeamColors(minimaps))
				: null,
		teams: board
			? teamsFromScoreboard(board, deaths)
			: teamsFromMinimaps(minimaps, deaths),
		winner: board ? 0 : null,
		pov:
			board && board.povIndex !== null
				? {
						team: board.povIndex < PLAYERS_PER_TEAM ? 0 : 1,
						index: board.povIndex % PLAYERS_PER_TEAM,
					}
				: null,
	};

	return { match, sources };
}

function floorOrNull(t: number | undefined): number | null {
	return t === undefined ? null : Math.max(0, Math.floor(t));
}

/**
 * The counter reads as `objective` samples in `teams` order. On POV footage
 * the left plate is the POV/alpha side for the whole game, but casted
 * footage reorders the plates to follow the specced player — so each read
 * is first oriented by its sides' team ink hues (clustered against the
 * first read that saw both), making the series side-stable. The whole
 * series then goes into `teams` order: a scoreboard-closed match is
 * winner-first (POV seat when read; else in SZ the winner is the side
 * whose remaining count went furthest down), a minimap-grouped match
 * anchors on the minimap's own/alpha-vs-enemy/bravo ink colors, and with
 * no signal the first read's arrangement stands.
 */
function buildObjective(
	objectives: readonly { t: number; data: ObjectiveData }[],
	board: ScoreboardData | undefined,
	minimapColors: [InkRgb | null, InkRgb | null] | null,
): ScannerMatchObjective | null {
	if (objectives.length === 0) return null;

	const clusterHues = seedClusterHues(objectives);
	const oriented = orientByTeamColor(objectives, clusterHues);

	const swap = board
		? board.povIndex !== null
			? board.povIndex >= PLAYERS_PER_TEAM
			: bestCount(oriented, 1) < bestCount(oriented, 0)
		: minimapAnchorSwap(clusterHues, minimapColors);

	const samples = oriented.map((read): ScannerMatchObjectiveSample => {
		const [a, b] = swap ? ([1, 0] as const) : ([0, 1] as const);
		return {
			t: Math.max(0, Math.floor(read.t)),
			time: read.time,
			score: [read.score[a], read.score[b]],
			penalty: [read.penalty[a], read.penalty[b]],
			control: [read.control[a], read.control[b]],
		};
	});
	return { mode: "SZ", samples };
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
 * The two team-ink cluster hues, seeded from the first read that saw both
 * sides' colors far enough apart; null when no read qualifies (color
 * orientation then stays at the as-read arrangement).
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
 * Assign every read's sides to the color clusters: a read whose ink hues
 * sit closer to the clusters crosswise is swapped (the cast switched the
 * specced side). Reads with no readable color inherit the previous read's
 * orientation — plate arrangement only changes with a camera change, which
 * leaves the colors readable once the plates are back.
 */
function orientByTeamColor(
	objectives: readonly { t: number; data: ObjectiveData }[],
	clusterHues: [number, number] | null,
): OrientedObjectiveRead[] {
	let previousSwapped = false;
	return objectives.map(({ t, data }): OrientedObjectiveRead => {
		const swapped = clusterHues
			? readSwapped(data, clusterHues, previousSwapped)
			: false;
		previousSwapped = swapped;
		const [a, b] = swapped ? ([1, 0] as const) : ([0, 1] as const);
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
 * Whether the cluster order is bravo-first, judged against the minimap's
 * ink colors (own/alpha column, enemy/bravo column) — the `teams` anchor
 * for cast matches, which never see a results screen.
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

/**
 * Componentwise mean of the minimap reads' per-side ink colors; null when
 * no read got a side's color (or there were no minimaps at all).
 */
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
 * The wall-clock time the match was played: a replay/battle log screen's
 * on-screen recording timestamp (anchored to when the screen was seen, not
 * a possibly much later send), else the closing scoreboard's detection
 * time. Detection times ride richer event records (StoredEvent) and are
 * read structurally so the builder stays generic.
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
): [ScannerMatchTeam, ScannerMatchTeam] {
	const abilities = harvestAbilities(board.players, deaths);
	const players = board.players.map((player, i): ScannerMatchPlayer => {
		const build = abilities.get(i);
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
 * Players merged across a match's minimap frames, alpha side then bravo:
 * weapons and names are fixed for a match, so a slot missed in one frame is
 * filled from another (first frame that read it wins).
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
	frames: Array<Array<{ name: string | null; weaponId: MainWeaponId | null }>>,
): ScannerMatchPlayer[] {
	const width = Math.max(0, ...frames.map((frame) => frame.length));
	const out: ScannerMatchPlayer[] = [];
	for (let i = 0; i < width; i++) {
		const reads = frames
			.map((frame) => frame[i])
			.filter((read) => read !== undefined);
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
		});
	}
	return out;
}
