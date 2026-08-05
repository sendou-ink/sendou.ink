/**
 * Group a detected-event timeline into per-match rows for sendou.ink's
 * /ingest/vod endpoint (contract: sendou-ingest-endpoint.md), which builds a
 * CAST-type VoD on /vods out of them.
 *
 * A VoD match becomes a `VideoMatch`: it needs a mode, a stage, a start
 * timestamp to jump to in the YouTube embed, and the two teams' weapons.
 * Casted broadcasts run their own between-map graphics (caster desk, stage
 * pick, set score) instead of the native results/map-intro screens, so — apart
 * from a POV VoD that happens to show them — the only native Splatoon UI is the
 * in-match **spectator map screen**. Matches are therefore built primarily from
 * the minimap, which shows all eight players' weapons and (via the planner
 * signature) the stage.
 *
 * Because such footage carries no MapStart/Scoreboard events to delimit
 * matches, minimaps are split into per-map matches by **stage change** and a
 * **time gap** (a Splatoon game is only a few minutes, so minimaps far apart
 * belong to different maps). A MapStart still opens a match and a scoreboard
 * still closes one when present, and either supplies the mode/weapons then.
 *
 * The minimap cannot read the **mode**; for this PoC it is hard-coded to Splat
 * Zones when no MapStart/Scoreboard supplied one. Weapons are left as the
 * detector read them (sendou main-weapon ids, or null for a slot that never
 * read); the endpoint validates them and skips any match missing a mode,
 * stage, or a full set of weapons.
 */

import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "./detectors/map-start/index";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
} from "./detectors/minimap/index";
import { SCOREBOARD_EVENT_TYPES } from "./detectors/registry";
import type { ScoreboardData } from "./detectors/scoreboard/index";
import type { DetectedEvent } from "./detectors/types";

/**
 * PoC: casted broadcasts never expose the mode to any detector, so minimap-only
 * matches default to Splat Zones — flagged via `modeAssumed` so downstream can
 * tell the guess from a real read. Replace with real mode detection later.
 */
const DEFAULT_MODE = "SZ" satisfies ModeShort;

/**
 * Two minimaps more than this far apart cannot be the same game (a Splatoon
 * match runs a few minutes), so they open separate matches even on the same
 * stage — the map-open the caster shows near a game's start and end still fall
 * inside it.
 */
const MATCH_GAP_SECONDS = 300;

/** One VoD match as prefilled into sendou.ink's /vods/new form. */
export interface VodMatch {
	/** whole seconds into the video the match starts at */
	startsAt: number;
	/** null when no source read it */
	mode: ModeShort | null;
	/**
	 * true when `mode` is the fabricated PoC default rather than a real
	 * read — lets the endpoint/form treat it as a guess, not a detection
	 */
	modeAssumed: boolean;
	/** null when no source read it */
	stage: StageId | null;
	/**
	 * the match's weapons, alpha team then bravo team: sendou main-weapon
	 * ids, or null for a slot that never read
	 */
	weapons: (MainWeaponId | null)[];
}

/** A match being accumulated as the timeline is walked. */
interface OpenMatch {
	mapStart: DetectedEvent | null;
	firstMinimap: DetectedEvent | null;
	minimaps: DetectedEvent[];
	scoreboard: DetectedEvent | null;
	/**
	 * per-stage read counts across the match's minimaps (a MapStart's stage
	 * seeds it); the plurality winner delimits same-vs-next map and is the
	 * reported stage, so one misread frame can't poison the whole match
	 */
	stageVotes: Map<StageId, number>;
	/** t of the last minimap added, for the gap check */
	lastMinimapT: number | null;
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

/**
 * Splits a timeline into VoD matches. MapStart opens a match and a scoreboard
 * closes one; between them (or with neither) minimaps are grouped per map by
 * stage and time gap.
 */
export function buildVodMatches(events: readonly DetectedEvent[]): VodMatch[] {
	const sorted = [...events].sort((a, b) => a.t - b.t);
	const matches: VodMatch[] = [];

	// For each minimap event, the next minimap's non-null stage read (walked
	// backwards). A stage change only splits when the next read doesn't refute
	// it: a lone frame disagreeing with both its match's running stage and the
	// following read is a misread to fold in as a minority vote, not a match
	// boundary. With no later read the change stands.
	const nextStage = new Map<DetectedEvent, StageId | null>();
	let carry: StageId | null = null;
	for (let i = sorted.length - 1; i >= 0; i--) {
		const event = sorted[i]!;
		if (event.type !== MINIMAP_EVENT_TYPE) continue;
		nextStage.set(event, carry);
		carry = (event.data as MinimapData).stage ?? carry;
	}

	let open: OpenMatch | null = null;
	const start = (): OpenMatch => ({
		mapStart: null,
		firstMinimap: null,
		minimaps: [],
		scoreboard: null,
		stageVotes: new Map(),
		lastMinimapT: null,
	});
	const vote = (votes: Map<StageId, number>, stage: StageId | null): void => {
		if (stage !== null) votes.set(stage, (votes.get(stage) ?? 0) + 1);
	};
	const finalize = (): void => {
		if (!open) return;
		const match = toVodMatch(open);
		if (match) matches.push(match);
		open = null;
	};

	for (const event of sorted) {
		if (event.type === MAP_START_EVENT_TYPE) {
			finalize();
			open = start();
			open.mapStart = event;
			vote(open.stageVotes, (event.data as MapStartData).stage ?? null);
		} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			open ??= start();
			open.scoreboard = event;
			vote(open.stageVotes, (event.data as ScoreboardData).stage ?? null);
			finalize();
		} else if (event.type === MINIMAP_EVENT_TYPE) {
			const stage = (event.data as MinimapData).stage;
			if (open) {
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
			open ??= start();
			open.minimaps.push(event);
			open.firstMinimap ??= event;
			open.lastMinimapT = event.t;
			vote(open.stageVotes, stage);
		}
	}
	finalize();

	return matches;
}

/** Builds a match, or null when it carries no weapons to show. */
function toVodMatch(open: OpenMatch): VodMatch | null {
	const start = open.mapStart?.data as MapStartData | undefined;
	const board = open.scoreboard?.data as ScoreboardData | undefined;

	const weapons = board
		? board.players.map((player) => player.weaponId)
		: weaponsFromMinimaps(open.minimaps);
	if (weapons.length === 0) return null;

	const anchorT =
		open.mapStart?.t ?? open.firstMinimap?.t ?? open.scoreboard?.t ?? 0;

	const readMode = start?.mode ?? board?.mode ?? null;
	return {
		startsAt: Math.max(0, Math.floor(anchorT)),
		mode: readMode ?? DEFAULT_MODE,
		modeAssumed: readMode === null,
		stage: start?.stage ?? board?.stage ?? leadingStage(open.stageVotes),
		weapons,
	};
}

/**
 * Merges the eight weapon slots (four alpha then four bravo) across a match's
 * minimaps, taking the first frame that read each slot — weapons are fixed for
 * a match, so a slot missed in one frame is filled from another. Empty when
 * there were no minimaps.
 */
function weaponsFromMinimaps(
	minimaps: DetectedEvent[],
): (MainWeaponId | null)[] {
	if (minimaps.length === 0) return [];
	const datas = minimaps.map((event) => event.data as MinimapData);
	const alpha = mergeSlots(
		datas.map((d) => d.teammates.map((t) => t.weaponId)),
	);
	const bravo = mergeSlots(datas.map((d) => d.enemies.map((e) => e.weaponId)));
	return [...alpha, ...bravo];
}

/** For each slot index, the first non-null id across frames, else null. */
function mergeSlots(
	frames: (MainWeaponId | null)[][],
): (MainWeaponId | null)[] {
	const width = Math.max(0, ...frames.map((frame) => frame.length));
	const out: (MainWeaponId | null)[] = [];
	for (let i = 0; i < width; i++) {
		out.push(frames.map((frame) => frame[i]).find((id) => id != null) ?? null);
	}
	return out;
}
