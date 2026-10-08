/**
 * Strip-slot → scoreboard-row assignment. The in-match icon strip (and the
 * minimap's card columns, which mirror it) keeps the lobby seating for the
 * whole set, while the results scoreboard re-sorts each team per game, so
 * per-slot status series pair with rows only through identity evidence:
 *
 * - weapon votes: per-slot candidate scores accumulated across a match's
 *   StripWeapons reads plus the minimap cards' parsed weapons. The best of the
 *   24 slot→row assignments against the scoreboard's four weapons wins — the
 *   global constraint corrects slots whose own evidence is wrong or missing
 *   (attested: a slot with zero readable votes still lands by elimination).
 * - card names (the POV minimap's teammate diamond): matched against row names.
 *
 * Ties resolve toward the fewest moved slots, so two rows sharing a weapon
 * keep their as-drawn order and thin evidence degrades to as-drawn, not a coin flip.
 */
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { editDistance, matchKey } from "./text";

/** A slot→row permutation: `perm[slot]` is the scoreboard row the slot feeds. */
export type SlotRowPermutation = readonly [number, number, number, number];

export const IDENTITY_PERMUTATION: SlotRowPermutation = [0, 1, 2, 3];

/**
 * Total vote score the winning assignment needs before it may reorder, and
 * its lead over the best differing assignment. Calibrated on the sendou-triton
 * VoD: correct assignments scored 10-33 with margins 2.2-5.3 over ~20 reads;
 * junk evidence (a strip geometry mispick, lookalikes) spreads flat and fails.
 */
const MIN_ASSIGNMENT_SCORE = 1.5;
const MIN_ASSIGNMENT_MARGIN = 0.75;

/**
 * A card name must resemble a row's name at least this much (1 - normalized
 * edit distance) to place the card: one garbled glyph of a five-char name
 * stays at 0.8, while unrelated names of the short lengths players pick
 * share at most a char or two.
 */
const MIN_NAME_SIMILARITY = 0.6;

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
 * The slot→row assignment best supported by one side's weapon votes against
 * its scoreboard row weapons; as-drawn when the evidence is too thin or too
 * close to call (MIN_ASSIGNMENT_SCORE/MARGIN).
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
