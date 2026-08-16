/**
 * Pure logic for stored scanner matches: canonical serialization (hashing),
 * deciding whether two partial ScannerMatches describe the same game, and
 * merging a newly ingested partial into a stored one.
 */
import type {
	ScannerMatch,
	ScannerMatchObjective,
	ScannerMatchPlayer,
	ScannerMatchPlayerStatus,
	ScannerMatchTeam,
} from "~/features/scanner/core/scanner-match";
import { inGameNameWithoutDiscriminator } from "~/utils/strings";

/**
 * Replay codes are random enough that two different games share almost no
 * positions; this many differing characters still reads as OCR jitter of
 * the same code, at or above it as a different game.
 */
const REPLAY_CODE_MAX_OCR_ERRORS = 3;

/** Two reads of one game land within this of each other (clock skew, retries). */
const PLAYED_AT_AFFINITY_MS = 10 * 60 * 1000;
/** Reads further apart than this cannot be the same few-minute game. */
const PLAYED_AT_CONTRADICTION_MS = 20 * 60 * 1000;

/** How many of the 8 rosters' readable names must align for identity. */
const MIN_NAME_OVERLAP = 6;
/** How many of the 8 weapon slots must align (with ≥7 read on both sides). */
const MIN_WEAPON_OVERLAP = 7;
const MIN_WEAPON_SLOTS_READ = 7;

const PLAYERS_PER_TEAM = 4;

/**
 * Rebuilds a match with a fixed key order so `JSON.stringify` of the result
 * is stable regardless of how the input was constructed — the hashing and
 * change-detection representation.
 */
export function canonicalMatch(match: ScannerMatch): ScannerMatch {
	return {
		startsAt: match.startsAt,
		endsAt: match.endsAt,
		playedAt: match.playedAt,
		lobby: match.lobby,
		mode: match.mode,
		stage: match.stage,
		matchScores:
			match.matchScores === null
				? null
				: [match.matchScores[0], match.matchScores[1]],
		replayCode: match.replayCode,
		cast: match.cast,
		objective:
			match.objective === null ? null : canonicalObjective(match.objective),
		// `?? null` also normalizes rows stored before the field existed
		playerStatus:
			match.playerStatus == null
				? null
				: canonicalPlayerStatus(match.playerStatus),
		teams: [canonicalTeam(match.teams[0]), canonicalTeam(match.teams[1])],
		winner: match.winner,
		pov:
			match.pov === null
				? null
				: { team: match.pov.team, index: match.pov.index },
	};
}

/**
 * Whether two (possibly partial) matches describe the same game. Callers
 * pre-scope candidates to the same tournament + POV user; this checks the
 * contents: contradicting mode/stage/replay-code/play-time rules identity
 * out, then a matching replay code, close play times, or an aligning roster
 * (names, or weapons when names are unread) rules it in.
 */
export function isSameMatch(a: ScannerMatch, b: ScannerMatch): boolean {
	if (a.mode !== null && b.mode !== null && a.mode !== b.mode) return false;
	if (a.stage !== null && b.stage !== null && a.stage !== b.stage) return false;

	const codeDiff = replayCodeDiff(a.replayCode, b.replayCode);
	if (codeDiff !== null && codeDiff > REPLAY_CODE_MAX_OCR_ERRORS) return false;

	const playedDiff =
		a.playedAt !== null && b.playedAt !== null
			? Math.abs(a.playedAt - b.playedAt)
			: null;
	if (playedDiff !== null && playedDiff > PLAYED_AT_CONTRADICTION_MS) {
		return false;
	}

	if (codeDiff !== null) return true;
	if (playedDiff !== null && playedDiff <= PLAYED_AT_AFFINITY_MS) return true;

	const aligned = bestAlignment(a, b);
	if (aligned.nameOverlap >= MIN_NAME_OVERLAP) return true;
	if (
		aligned.weaponOverlap >= MIN_WEAPON_OVERLAP &&
		weaponSlotsRead(a) >= MIN_WEAPON_SLOTS_READ &&
		weaponSlotsRead(b) >= MIN_WEAPON_SLOTS_READ
	) {
		return true;
	}
	return false;
}

/**
 * Merges a newly ingested partial into the stored match: the incoming teams
 * are first aligned to the stored orientation (a scoreboard match's teams[0]
 * is the winner side while a minimap match's is alpha), then every field
 * fills stored nulls, stored values winning on conflict (mirroring the
 * scoreboard attachment's first-ingest-wins). `changed` is false when the
 * merge added nothing, so callers can skip the write.
 */
export function mergeMatches(
	existing: ScannerMatch,
	incoming: ScannerMatch,
): { merged: ScannerMatch; changed: boolean } {
	const oriented =
		bestAlignment(existing, incoming).orientation === "swapped"
			? swapSides(incoming)
			: incoming;

	const merged: ScannerMatch = {
		startsAt: existing.startsAt ?? oriented.startsAt,
		endsAt: existing.endsAt ?? oriented.endsAt,
		playedAt: existing.playedAt ?? oriented.playedAt,
		lobby: existing.lobby ?? oriented.lobby,
		mode: existing.mode ?? oriented.mode,
		stage: existing.stage ?? oriented.stage,
		matchScores: mergeScorePair(existing.matchScores, oriented.matchScores),
		replayCode: existing.replayCode ?? oriented.replayCode,
		cast: existing.cast || oriented.cast,
		// whole-series first-ingest-wins: interleaving two partial sample
		// series from different scans is not attempted
		objective: existing.objective ?? oriented.objective,
		playerStatus: existing.playerStatus ?? oriented.playerStatus,
		teams: [
			mergeTeam(existing.teams[0], oriented.teams[0]),
			mergeTeam(existing.teams[1], oriented.teams[1]),
		],
		winner: existing.winner ?? oriented.winner,
		pov: existing.pov ?? oriented.pov,
	};

	return {
		merged,
		changed:
			JSON.stringify(canonicalMatch(merged)) !==
			JSON.stringify(canonicalMatch(existing)),
	};
}

/** Lowercased, width-normalized in-game name without the #discriminator. */
export function normalizeInGameName(name: string): string {
	return inGameNameWithoutDiscriminator(name)
		.normalize("NFKC")
		.trim()
		.toLowerCase();
}

function canonicalObjective(
	objective: ScannerMatchObjective,
): ScannerMatchObjective {
	return {
		mode: objective.mode,
		samples: objective.samples.map((sample) => ({
			t: sample.t,
			time: sample.time,
			score: [sample.score[0], sample.score[1]],
			penalty: [sample.penalty[0], sample.penalty[1]],
			control: [sample.control[0], sample.control[1]],
		})),
	};
}

function canonicalPlayerStatus(
	playerStatus: ScannerMatchPlayerStatus,
): ScannerMatchPlayerStatus {
	return {
		samples: playerStatus.samples.map((sample) => ({
			t: sample.t,
			time: sample.time,
			special: [[...sample.special[0]], [...sample.special[1]]],
			dead: [[...sample.dead[0]], [...sample.dead[1]]],
		})),
	};
}

function canonicalTeam(team: ScannerMatchTeam): ScannerMatchTeam {
	return {
		players: team.players.map(canonicalPlayer),
	};
}

function canonicalPlayer(player: ScannerMatchPlayer): ScannerMatchPlayer {
	return {
		name: player.name,
		weaponId: player.weaponId,
		paint: player.paint,
		ka: player.ka,
		d: player.d,
		s: player.s,
		...(player.abilities ? { abilities: player.abilities } : null),
	};
}

/**
 * Positions at which two replay codes differ; null when either is unread.
 * A length mismatch counts every position of the longer code.
 */
function replayCodeDiff(a: string | null, b: string | null): number | null {
	if (a === null || b === null) return null;
	const longer = Math.max(a.length, b.length);
	let diff = longer - Math.min(a.length, b.length);
	for (let i = 0; i < Math.min(a.length, b.length); i++) {
		if (a[i] !== b[i]) diff++;
	}
	return diff;
}

interface Alignment {
	orientation: "straight" | "swapped";
	/** aligned readable-name matches across both team pairs (0-8) */
	nameOverlap: number;
	/** aligned weapon multiset overlap across both team pairs (0-8) */
	weaponOverlap: number;
}

/**
 * How `b`'s teams best map onto `a`'s: as-is or sides swapped, scored by
 * name and weapon overlap. Ties keep "straight".
 */
function bestAlignment(a: ScannerMatch, b: ScannerMatch): Alignment {
	const straight = pairScore(a, b.teams[0], b.teams[1]);
	const swapped = pairScore(a, b.teams[1], b.teams[0]);
	const straightTotal = straight.nameOverlap + straight.weaponOverlap;
	const swappedTotal = swapped.nameOverlap + swapped.weaponOverlap;
	return swappedTotal > straightTotal
		? { orientation: "swapped", ...swapped }
		: { orientation: "straight", ...straight };
}

function pairScore(
	a: ScannerMatch,
	bFirst: ScannerMatchTeam,
	bSecond: ScannerMatchTeam,
): { nameOverlap: number; weaponOverlap: number } {
	return {
		nameOverlap:
			nameOverlap(a.teams[0], bFirst) + nameOverlap(a.teams[1], bSecond),
		weaponOverlap:
			weaponOverlap(a.teams[0], bFirst) + weaponOverlap(a.teams[1], bSecond),
	};
}

function nameOverlap(a: ScannerMatchTeam, b: ScannerMatchTeam): number {
	const bNames = new Set(
		b.players
			.map((player) => (player.name ? normalizeInGameName(player.name) : ""))
			.filter(Boolean),
	);
	return a.players.filter(
		(player) => player.name && bNames.has(normalizeInGameName(player.name)),
	).length;
}

function weaponOverlap(a: ScannerMatchTeam, b: ScannerMatchTeam): number {
	const pool = b.players
		.map((player) => player.weaponId)
		.filter((id) => id !== null);
	let overlap = 0;
	for (const player of a.players) {
		if (player.weaponId === null) continue;
		const i = pool.indexOf(player.weaponId);
		if (i === -1) continue;
		pool.splice(i, 1);
		overlap++;
	}
	return overlap;
}

function weaponSlotsRead(match: ScannerMatch): number {
	return match.teams.flatMap((team) =>
		team.players.filter((player) => player.weaponId !== null),
	).length;
}

function swapSides(match: ScannerMatch): ScannerMatch {
	return {
		...match,
		teams: [match.teams[1], match.teams[0]],
		winner: match.winner === null ? null : match.winner === 0 ? 1 : 0,
		pov:
			match.pov === null
				? null
				: { ...match.pov, team: match.pov.team === 0 ? 1 : 0 },
		matchScores:
			match.matchScores === null
				? null
				: [match.matchScores[1], match.matchScores[0]],
		objective:
			match.objective === null
				? null
				: {
						mode: match.objective.mode,
						samples: match.objective.samples.map((sample) => ({
							...sample,
							score: [sample.score[1], sample.score[0]],
							penalty: [sample.penalty[1], sample.penalty[0]],
							control: [sample.control[1], sample.control[0]],
						})),
					},
		playerStatus:
			match.playerStatus == null
				? null
				: {
						samples: match.playerStatus.samples.map((sample) => ({
							...sample,
							special: [sample.special[1], sample.special[0]],
							dead: [sample.dead[1], sample.dead[0]],
						})),
					},
	};
}

function mergeScorePair(
	existing: [number | null, number | null] | null,
	incoming: [number | null, number | null] | null,
): [number | null, number | null] | null {
	if (existing === null) return incoming;
	if (incoming === null) return existing;
	return [existing[0] ?? incoming[0], existing[1] ?? incoming[1]];
}

/**
 * Merge one team's rows: each stored row takes its incoming counterpart —
 * matched by readable name, then by a weapon unique among the unmatched,
 * then by position — field-wise with stored values winning. Incoming rows
 * no stored row claimed append while the team stays ≤4.
 */
function mergeTeam(
	existing: ScannerMatchTeam,
	incoming: ScannerMatchTeam,
): ScannerMatchTeam {
	const pool = incoming.players.map((player) => ({ player, used: false }));
	const counterparts: (ScannerMatchPlayer | null)[] = existing.players.map(
		(player) => {
			const name = player.name ? normalizeInGameName(player.name) : "";
			if (!name) return null;
			const hit = pool.find(
				(entry) =>
					!entry.used &&
					entry.player.name !== null &&
					normalizeInGameName(entry.player.name) === name,
			);
			if (!hit) return null;
			hit.used = true;
			return hit.player;
		},
	);
	for (const [i, player] of existing.players.entries()) {
		if (counterparts[i] || player.weaponId === null) continue;
		const hits = pool.filter(
			(entry) => !entry.used && entry.player.weaponId === player.weaponId,
		);
		if (hits.length !== 1) continue;
		hits[0]!.used = true;
		counterparts[i] = hits[0]!.player;
	}
	for (const i of existing.players.keys()) {
		if (counterparts[i]) continue;
		const hit = pool[i]?.used === false ? pool[i]! : pool.find((e) => !e.used);
		if (!hit) continue;
		hit.used = true;
		counterparts[i] = hit.player;
	}

	const players = existing.players.map((player, i) => {
		const counterpart = counterparts[i];
		return counterpart ? mergePlayer(player, counterpart) : player;
	});
	for (const entry of pool) {
		if (entry.used || players.length >= PLAYERS_PER_TEAM) continue;
		players.push(entry.player);
	}

	return { players };
}

function mergePlayer(
	existing: ScannerMatchPlayer,
	incoming: ScannerMatchPlayer,
): ScannerMatchPlayer {
	const abilities = existing.abilities ?? incoming.abilities;
	return {
		name: existing.name ?? incoming.name,
		weaponId: existing.weaponId ?? incoming.weaponId,
		paint: existing.paint ?? incoming.paint,
		ka: existing.ka ?? incoming.ka,
		d: existing.d ?? incoming.d,
		s: existing.s ?? incoming.s,
		...(abilities ? { abilities } : null),
	};
}
