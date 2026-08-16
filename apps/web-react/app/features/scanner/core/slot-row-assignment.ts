/**
 * Strip-slot → scoreboard-row assignment. The in-match icon strip (and the
 * minimap's card columns, which mirror it) keeps the lobby seating for the
 * whole set, while the results scoreboard re-sorts each team per game — so
 * per-slot status series can only be paired with scoreboard rows through
 * identity evidence. Two kinds are combined:
 *
 * - weapon votes: per-slot candidate scores accumulated across a match's
 *   sampled StripWeapons reads (strip-weapons.ts) plus the minimap cards'
 *   parsed weapons. The best-scoring of the 24 possible slot→row
 *   assignments against the scoreboard's four weapons wins — the global
 *   constraint corrects slots whose own evidence is wrong or missing
 *   (attested: a slot with zero readable votes still lands right by
 *   elimination).
 * - card names (the POV minimap's teammate diamond): matched directly
 *   against scoreboard row names.
 *
 * Ties resolve toward the fewest moved slots, so two rows sharing a weapon
 * keep their as-drawn relative order, and thin evidence degrades to the
 * as-drawn arrangement rather than a coin flip.
 */
import type { MainWeaponId } from "~/modules/in-game-lists/types";

/** A slot→row permutation: `perm[slot]` is the scoreboard row the slot feeds. */
export type SlotRowPermutation = readonly [number, number, number, number];

export const IDENTITY_PERMUTATION: SlotRowPermutation = [0, 1, 2, 3];

/**
 * Total accumulated vote score the winning assignment needs before it may
 * reorder anything, and the lead it needs over the best differing
 * assignment. Calibrated on the sendou-triton VoD, where correct
 * assignments scored 10-33 with margins 2.2-5.3 over ~20 sampled reads;
 * junk evidence (a strip geometry mispick, non-Splatoon lookalikes)
 * spreads flat and fails the margin.
 */
const MIN_ASSIGNMENT_SCORE = 1.5;
const MIN_ASSIGNMENT_MARGIN = 0.75;

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

/**
 * The slot→row assignment best supported by one side's accumulated weapon
 * votes, against that side's scoreboard row weapons. Falls back to the
 * as-drawn order when the evidence is too thin or too close to call (see
 * MIN_ASSIGNMENT_SCORE/MARGIN).
 */
export function weaponSlotRowPermutation(
	votes: readonly ReadonlyMap<MainWeaponId, number>[],
	rowWeapons: readonly (MainWeaponId | null)[],
): SlotRowPermutation {
	const scored = PERMUTATIONS.map((perm) => ({
		perm,
		score: perm.reduce((sum, row, slot) => {
			const weapon = rowWeapons[row];
			return sum + (weapon === null ? 0 : (votes[slot]?.get(weapon!) ?? 0));
		}, 0),
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

/**
 * A card→row assignment from card names (the POV minimap's teammate
 * diamond, whose order matches neither the strip nor the scoreboard):
 * unique case-insensitive name matches place their cards, the leftovers
 * keep their relative as-drawn order. Null — keep the as-drawn order —
 * when fewer than two cards resolve, since a single hit cannot attest the
 * arrangement is worth disturbing.
 */
export function nameSlotRowPermutation(
	cardNames: readonly (string | null)[],
	rowNames: readonly (string | null)[],
): SlotRowPermutation | null {
	const normalized = (name: string | null) =>
		name?.trim().toLowerCase() || null;
	const rows = rowNames.map(normalized);
	const assignment: (number | null)[] = [null, null, null, null];
	const takenRows = new Set<number>();
	let resolved = 0;
	for (const [slot, cardName] of cardNames.map(normalized).entries()) {
		if (cardName === null) continue;
		const matches = rows.flatMap((row, i) => (row === cardName ? [i] : []));
		if (matches.length !== 1 || takenRows.has(matches[0]!)) continue;
		assignment[slot] = matches[0]!;
		takenRows.add(matches[0]!);
		resolved++;
	}
	if (resolved < 2) return null;
	const freeRows = [0, 1, 2, 3].filter((row) => !takenRows.has(row));
	for (const [slot, row] of assignment.entries()) {
		if (row === null) assignment[slot] = freeRows.shift()!;
	}
	return assignment as unknown as SlotRowPermutation;
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
