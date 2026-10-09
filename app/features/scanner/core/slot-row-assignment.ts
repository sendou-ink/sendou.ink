/**
 * Strip-slot → scoreboard-row assignment. The in-match icon strip (and the
 * minimap's card columns, which mirror it) keeps its own seating, which can
 * change every game, while the results scoreboard re-sorts each team, so
 * per-slot status series pair with rows only through identity evidence. Every
 * source adds to one slot × row evidence matrix per side, and the best of the
 * 24 slot→row assignments wins:
 *
 * - weapons: per-slot candidate scores from the match's StripWeapons reads and
 *   the minimap cards' parsed weapons, credited to every row playing that
 *   weapon. The global constraint places a slot with no readable votes by
 *   elimination.
 * - statuses: a player known by name (a POV minimap card, the POV's own death
 *   screen, a kill-feed victim) seen splatted, special-ready or neither at a
 *   moment credits the slots drawn in that state then. This tells apart two
 *   rows sharing a weapon, which the weapon evidence alone cannot.
 *
 * Ties resolve toward the fewest moved slots, so thin evidence degrades to
 * as-drawn, not a coin flip.
 */
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { PlayerStatusFlags } from "./detectors/objective/player-status";
import { editDistance, matchKey } from "./text";

/** A slot→row permutation: `perm[slot]` is the scoreboard row the slot feeds. */
export type SlotRowPermutation = readonly [number, number, number, number];

export const IDENTITY_PERMUTATION: SlotRowPermutation = [0, 1, 2, 3];

/** One side's identity evidence: `evidence[slot][row]`. */
export type SlotRowEvidence = number[][];

/** One side's strip flags at a read. */
export interface StripSnapshot {
	t: number;
	dead: PlayerStatusFlags;
	special: PlayerStatusFlags;
}

/** A named player's state at a moment, the row already resolved. */
export interface StatusObservation {
	/** when the strip should show the state */
	t: number;
	row: number;
	dead: boolean;
	/** null = not observed */
	special: boolean | null;
}

/**
 * Total evidence the winning assignment needs before it may reorder, and its
 * lead over the best differing assignment. Strip votes run ~0.1-0.4 per read
 * (score over the read's candidate floor) and a status observation at most 1,
 * so the margin is two or three reads' worth.
 */
const MIN_ASSIGNMENT_SCORE = 1.5;
const MIN_ASSIGNMENT_MARGIN = 0.75;

/**
 * A name must resemble a row's name at least this much (1 - normalized edit
 * distance) to place it: one garbled glyph of a five-char name stays at 0.8,
 * while unrelated names of the short lengths players pick share at most a
 * char or two.
 */
const MIN_NAME_SIMILARITY = 0.6;

/** How far from an observation the nearest strip read may sit (s); a splat outlasts it, a special-ready flip may not. */
const OBSERVATION_MAX_GAP_SECONDS = 2;

/** All 24 permutations, fewest-moved-slots first (ties resolve to earlier). */
const PERMUTATIONS: SlotRowPermutation[] = (() => {
	const all: SlotRowPermutation[] = [];
	for (const a of [0, 1, 2, 3])
		for (const b of [0, 1, 2, 3])
			for (const c of [0, 1, 2, 3])
				for (const d of [0, 1, 2, 3]) {
					if (new Set([a, b, c, d]).size === 4) all.push([a, b, c, d]);
				}
	const displaced = (perm: SlotRowPermutation) =>
		perm.filter((row, slot) => row !== slot).length;
	return all.sort((x, y) => displaced(x) - displaced(y));
})();

/** An all-zero evidence matrix. */
export function emptySlotRowEvidence(): SlotRowEvidence {
	return [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
}

/** Credits `vote` for `slot` playing `weaponId` to every row whose scoreboard weapon it is. */
export function addWeaponEvidence(
	evidence: SlotRowEvidence,
	slot: number,
	weaponId: MainWeaponId,
	vote: number,
	rowWeapons: readonly (MainWeaponId | null)[],
): void {
	for (const [row, weapon] of rowWeapons.entries()) {
		if (weapon === weaponId) evidence[slot]![row]! += vote;
	}
}

/**
 * Credits the observed row to the slots drawn in the observed state at the
 * strip read nearest the observation, one unit split among them; nothing when
 * no read is near or no slot (or every slot) matches.
 */
export function addStatusEvidence(
	evidence: SlotRowEvidence,
	snapshots: readonly StripSnapshot[],
	observation: StatusObservation,
): void {
	let nearest: StripSnapshot | null = null;
	for (const snapshot of snapshots) {
		const gap = Math.abs(snapshot.t - observation.t);
		if (gap > OBSERVATION_MAX_GAP_SECONDS) continue;
		if (!nearest || gap < Math.abs(nearest.t - observation.t)) {
			nearest = snapshot;
		}
	}
	if (!nearest) return;
	const matching = [0, 1, 2, 3].filter(
		(slot) =>
			nearest.dead[slot] === observation.dead &&
			(observation.special === null ||
				nearest.special[slot] === observation.special),
	);
	if (matching.length === 0 || matching.length === 4) return;
	for (const slot of matching) {
		evidence[slot]![observation.row]! += 1 / matching.length;
	}
}

/**
 * The slot→row assignment best supported by one side's evidence; as-drawn
 * when the evidence is too thin or too close to call
 * (MIN_ASSIGNMENT_SCORE/MARGIN).
 */
export function slotRowPermutation(
	evidence: SlotRowEvidence,
): SlotRowPermutation {
	const scored = PERMUTATIONS.map((perm) => ({
		perm,
		score: perm.reduce((sum, row, slot) => sum + evidence[slot]![row]!, 0),
	}));
	let best = scored[0]!;
	for (const candidate of scored) {
		if (candidate.score > best.score) best = candidate;
	}
	if (best.score < MIN_ASSIGNMENT_SCORE) return IDENTITY_PERMUTATION;
	const runnerUp = Math.max(
		...scored
			.filter((candidate) => candidate.score < best.score)
			.map((candidate) => candidate.score),
		0,
	);
	if (best.score - runnerUp < MIN_ASSIGNMENT_MARGIN) {
		return IDENTITY_PERMUTATION;
	}
	return best.perm;
}

/** The row whose name `name` most resembles, or null when none passes MIN_NAME_SIMILARITY. */
export function rowByName(
	name: string,
	rowNames: readonly (string | null)[],
): number | null {
	let best: number | null = null;
	let bestSimilarity = MIN_NAME_SIMILARITY;
	for (const [row, rowName] of rowNames.entries()) {
		if (rowName === null) continue;
		const similarity = nameSimilarity(name, rowName);
		if (similarity >= bestSimilarity) {
			best = row;
			bestSimilarity = similarity;
		}
	}
	return best;
}

/**
 * A card→row assignment from card names (the POV minimap's teammate diamond,
 * ordered like neither the strip nor the scoreboard): the best of the 24
 * assignments by summed name similarity, each card scored by its closest read
 * against the row's name. OCR garbles both sides (a scoreboard "サンバイザ_"
 * for a card's "サンバイザー", trailing noise on a card), so matches are fuzzy;
 * pairs under MIN_NAME_SIMILARITY count nothing. Null (keep as drawn) when
 * fewer than two cards land on a row they resemble.
 */
export function nameSlotRowPermutation(
	cardNames: readonly (readonly string[])[],
	rowNames: readonly (string | null)[],
): SlotRowPermutation | null {
	const similarity = cardNames.map((names) =>
		rowNames.map((rowName) => {
			if (rowName === null) return 0;
			const best = Math.max(
				0,
				...names.map((name) => nameSimilarity(name, rowName)),
			);
			return best >= MIN_NAME_SIMILARITY ? best : 0;
		}),
	);
	const scored = PERMUTATIONS.map((perm) => ({
		perm,
		score: perm.reduce(
			(sum, row, card) => sum + (similarity[card]?.[row] ?? 0),
			0,
		),
	}));
	let best = scored[0]!;
	for (const candidate of scored) {
		if (candidate.score > best.score) best = candidate;
	}
	const resolved = best.perm.filter(
		(row, card) => (similarity[card]?.[row] ?? 0) > 0,
	).length;
	return resolved < 2 ? null : best.perm;
}

/** `flags` rearranged so slot `i`'s value lands at `perm[i]`. */
export function applyPermutation<T>(
	flags: readonly T[],
	perm: SlotRowPermutation,
): T[] {
	const out = [...flags] as T[];
	for (const [slot, row] of perm.entries()) out[row] = flags[slot]!;
	return out;
}

function nameSimilarity(a: string, b: string): number {
	const ka = matchKey(a);
	const kb = matchKey(b);
	return 1 - editDistance(ka, kb) / Math.max(ka.length, kb.length, 1);
}
