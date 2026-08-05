/**
 * Group a detected-event timeline into per-match batches for sendou.ink's
 * /ingest endpoint: a batch starts at a MapStart event and ends at the next
 * scoreboard-type event, carrying the match's death events in between. When
 * a scoreboard arrives with no preceding MapStart (the intro was missed),
 * the deaths since the previous scoreboard that fall within the last 10
 * minutes are taken as its match instead — anything older belongs to no
 * known match and is dropped, as is a match whose results screen was never
 * detected. Scoreboards whose lobby is readable and not "Private Battle"
 * are dropped together with their batch — only tournament lobbies are worth
 * sending. The batch's death events reveal enemy builds; they are attached
 * to the terminating scoreboard's player rows as `abilities` before
 * sending.
 */
import { harvestAbilities } from "./ability-harvest";
import { DEATH_EVENT_TYPE, type DeathData } from "./detectors/death/index";
import { MAP_START_EVENT_TYPE } from "./detectors/map-start/index";
import { SCOREBOARD_EVENT_TYPES } from "./detectors/registry";
import type {
	ScoreboardData,
	ScoreboardPlayer,
} from "./detectors/scoreboard/index";
import type { DetectedEvent } from "./detectors/types";

/** The lobby header value private battles (tournament games) carry. */
const TOURNAMENT_LOBBY = "PRIVATE";

/**
 * How far back a scoreboard with no preceding MapStart claims deaths as its
 * match — matches run well under 10 minutes, so anything older is another
 * (undelimited) match's.
 */
const FALLBACK_WINDOW_SECONDS = 600;

export interface IngestScoreboardPlayer extends ScoreboardPlayer {
	/** [head, clothes, shoes] ability rows harvested from this match's death screens */
	abilities?: string[][];
}

/**
 * Splits a timeline into ingest batches. Only event types the /ingest
 * endpoint accepts are included (MapStart, Death, Scoreboard,
 * ScoreboardReplay); each batch's scoreboard players carry the abilities
 * harvested from that batch's deaths.
 *
 * Generic so callers with richer event records (the UI's StoredEvent) keep
 * their extra fields — batch members are the input objects themselves,
 * except the terminating scoreboard, which is shallow-copied for
 * enrichment.
 */
export function buildIngestBatches<E extends DetectedEvent>(
	events: readonly E[],
): E[][] {
	const sorted = [...events].sort((a, b) => a.t - b.t);
	const batches: E[][] = [];
	let open: E[] | null = null;
	// deaths since the last boundary with no MapStart to anchor them yet
	let orphans: E[] = [];

	for (const event of sorted) {
		if (event.type === MAP_START_EVENT_TYPE) {
			// a new match intro abandons any match whose scoreboard was missed
			open = [event];
			orphans = [];
		} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
			const data = event.data as ScoreboardData;
			if (!data.lobby || data.lobby === TOURNAMENT_LOBBY) {
				const matchEvents =
					open ??
					orphans.filter((e) => event.t - e.t <= FALLBACK_WINDOW_SECONDS);
				batches.push([...matchEvents, enrichScoreboard(event, matchEvents)]);
			}
			open = null;
			orphans = [];
		} else if (event.type === DEATH_EVENT_TYPE) {
			(open ?? orphans).push(event);
		}
	}

	return batches;
}

/**
 * Groups whole batches into request-sized chunks of at most `maxEvents`
 * events. Sending as many batches as fit in one request lets sendou.ink's
 * content-based tournament resolution see the scoreboard *sequence* — a
 * single match batch (one scoreboard) can't resolve by content. A batch is
 * never split across chunks; an oversized lone batch gets its own chunk.
 */
export function chunkIngestBatches<E extends DetectedEvent>(
	batches: readonly E[][],
	maxEvents: number,
): E[][][] {
	const chunks: E[][][] = [];
	let current: E[][] = [];
	let eventCount = 0;
	for (const batch of batches) {
		if (current.length > 0 && eventCount + batch.length > maxEvents) {
			chunks.push(current);
			current = [];
			eventCount = 0;
		}
		current.push(batch);
		eventCount += batch.length;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
}

function enrichScoreboard<E extends DetectedEvent>(
	scoreboard: E,
	matchEvents: readonly E[],
): E {
	const deaths = matchEvents
		.filter((e) => e.type === DEATH_EVENT_TYPE)
		.map((e) => e.data as DeathData);
	const data = scoreboard.data as ScoreboardData;
	const abilities = harvestAbilities(data.players, deaths);
	if (abilities.size === 0) return scoreboard;

	const players: IngestScoreboardPlayer[] = data.players.map((player, i) => {
		const build = abilities.get(i);
		return build ? { ...player, abilities: build } : player;
	});
	return { ...scoreboard, data: { ...data, players } };
}
