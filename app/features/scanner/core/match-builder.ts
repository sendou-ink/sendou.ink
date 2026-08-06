/**
 * Group a detected-event timeline into ScannerMatch objects (scanner-match.ts).
 *
 * A MapStart opens a match and a scoreboard-type event closes one; deaths in
 * between belong to it. A scoreboard with no preceding MapStart claims the
 * deaths of the last 8 minutes as its match. Between delimiters (casted
 * footage has none) minimaps are grouped per map by stage change and time gap:
 * a Splatoon game runs a few minutes, so minimaps far apart are different
 * maps, and a confirmed stage read change is a new map. A match is emitted
 * only when a scoreboard or minimaps back it — a MapStart plus deaths whose
 * results screen was missed identifies no game.
 *
 * Matches are emitted regardless of lobby (the vods prefill wants every
 * match); senders filter with `isIngestableMatch`. Death events reveal enemy
 * builds and are harvested onto the match's player rows (ability-harvest.ts).
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
	SCOREBOARD_REPLAY_EVENT_TYPE,
	type ScoreboardReplayData,
} from "./detectors/scoreboard-replay/index";
import type { DetectedEvent } from "./detectors/types";
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
 * that identify no match (ScoreboardOwn) are ignored. Matches never
 * overlap: every input event ends up in at most one match's `sources` —
 * each event is placed in exactly one accumulator (or dropped), and the
 * orphan-death pool is emptied the moment a boundary claims or invalidates
 * it.
 */
export function buildScannerMatches<E extends DetectedEvent>(
	events: readonly E[],
): BuiltMatch<E>[] {
	const sorted = [...events].sort((a, b) => a.t - b.t);
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

/**
 * Whether a match is worth sending to /ingest: only tournament (Private
 * Battle) games are; an unreadable lobby gets the benefit of the doubt.
 */
export function isIngestableMatch(match: ScannerMatch): boolean {
	return match.lobby === null || match.lobby === TOURNAMENT_LOBBY;
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
	const replay =
		open.scoreboard?.type === SCOREBOARD_REPLAY_EVENT_TYPE
			? (open.scoreboard.data as ScoreboardReplayData)
			: undefined;
	const deaths = open.deaths.map((event) => event.data as DeathData);
	const objectives = open.objectives.map((event) => ({
		t: event.t,
		data: event.data as ObjectiveData,
	}));

	const mode = board?.mode ?? start?.mode ?? null;

	const match: ScannerMatch = {
		startsAt:
			sources.length > 0 ? Math.max(0, Math.floor(sources[0]!.t)) : null,
		endsAt: floorOrNull(open.scoreboard?.t ?? open.minimaps.at(-1)?.t),
		playedAt: playedAt(open.scoreboard, replay),
		lobby: board?.lobby ?? null,
		mode,
		stage: board?.stage ?? start?.stage ?? leadingStage(open.stageVotes),
		matchScores: board?.matchScores.some((score) => score !== null)
			? board.matchScores
			: null,
		replayCode: replay?.replayCode ?? null,
		cast: open.minimaps.some((event) => (event.data as MinimapData).spectator),
		// only the SZ counter is parsed — reads on a known other-mode match
		// are misreads of a lookalike overlay, not progress data
		objective:
			mode === null || mode === "SZ" ? buildObjective(objectives, board) : null,
		teams: board
			? teamsFromScoreboard(board, deaths)
			: teamsFromMinimaps(
					open.minimaps.map((event) => event.data as MinimapData),
					deaths,
				),
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
 * The counter reads as `objective` samples in `teams` order. The on-screen
 * plates put the POV/alpha side left, which already is teams[0] for a
 * minimap-grouped match; a scoreboard-closed match's teams are winner-first,
 * so the sides swap when the POV seat sat on the losing team — or, with no
 * POV arrow read, when the right plate's count got lower (in SZ the winner
 * is the team whose remaining count went furthest down; ties keep the order
 * as read).
 */
function buildObjective(
	objectives: readonly { t: number; data: ObjectiveData }[],
	board: ScoreboardData | undefined,
): ScannerMatchObjective | null {
	if (objectives.length === 0) return null;
	const swap = board
		? board.povIndex !== null
			? board.povIndex >= PLAYERS_PER_TEAM
			: bestCount(objectives, 1) < bestCount(objectives, 0)
		: false;
	const samples = objectives.map(({ t, data }): ScannerMatchObjectiveSample => {
		const [a, b] = swap ? ([1, 0] as const) : ([0, 1] as const);
		return {
			t: Math.max(0, Math.floor(t)),
			time: data.time,
			score: [data.score[a], data.score[b]],
			penalty: [data.penalty[a], data.penalty[b]],
			control: [data.control[a], data.control[b]],
		};
	});
	return { mode: "SZ", samples };
}

/** The lowest count a side's plate ever showed; Infinity when never read. */
function bestCount(
	objectives: readonly { data: ObjectiveData }[],
	side: 0 | 1,
): number {
	return Math.min(
		...objectives.map(
			({ data }) => data.score[side] ?? Number.POSITIVE_INFINITY,
		),
	);
}

/**
 * The wall-clock time the match was played: a replay scoreboard's on-screen
 * recording timestamp (anchored to when the screen was seen, not a possibly
 * much later send), else the closing scoreboard's detection time. Detection
 * times ride richer event records (StoredEvent) and are read structurally so
 * the builder stays generic.
 */
function playedAt(
	scoreboard: DetectedEvent | null,
	replay: ScoreboardReplayData | undefined,
): number | null {
	if (!scoreboard) return null;
	const detectedAt = (scoreboard as { detectedAt?: number }).detectedAt ?? null;
	if (replay?.timestamp) {
		const recorded = parseReplayTimestamp(replay.timestamp, {
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
