/** Small text utilities: edit distance and closed-set snapping for OCR output. */

function editDistance(a: string, b: string): number {
	const dp = Array.from({ length: a.length + 1 }, (_, i) => {
		const row = new Array<number>(b.length + 1).fill(0);
		row[0] = i;
		return row;
	});
	for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			dp[i]![j] = Math.min(
				dp[i - 1]![j]! + 1,
				dp[i]![j - 1]! + 1,
				dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
	}
	return dp[a.length]![b.length]!;
}

/** Case-, space- and diacritic-insensitive comparison key (é≈e), so an accent misread stays a near-match. */
export function matchKey(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, "");
}

export interface ClosestMatch<T> {
	entry: T;
	/** 1 = exact (ignoring case/spaces/diacritics), 0 = nothing in common */
	score: number;
}

/** Snap an OCR reading to the closest of a closed set of arbitrary entries. */
export function closestBy<T>(
	reading: string,
	entries: readonly T[],
	textOf: (entry: T) => string,
): ClosestMatch<T> | null {
	const r = matchKey(reading);
	let best: ClosestMatch<T> | null = null;
	for (const entry of entries) {
		const e = matchKey(textOf(entry));
		const d = editDistance(r, e);
		const score = 1 - d / Math.max(r.length, e.length, 1);
		if (!best || score > best.score) best = { entry, score };
	}
	return best;
}

/** Snap an OCR reading to the closest entry of a closed set of strings. */
export function closestEntry<T extends string>(
	reading: string,
	entries: readonly T[],
): ClosestMatch<T> | null {
	return closestBy(reading, entries, (e) => e);
}

/** Rank every entry of a closed set against an OCR reading, best first. */
export function rankBy<T>(
	reading: string,
	entries: readonly T[],
	textOf: (entry: T) => string,
): ClosestMatch<T>[] {
	const r = matchKey(reading);
	return entries
		.map((entry) => {
			const e = matchKey(textOf(entry));
			const d = editDistance(r, e);
			return { entry, score: 1 - d / Math.max(r.length, e.length, 1) };
		})
		.sort((a, b) => b.score - a.score);
}

/** One recognized segment with its ranked alternatives — structurally compatible with glyphs.ts RecognizedChar. */
export interface ReadSegment {
	candidates?: readonly { char: string; score: number }[];
}

/**
 * Ranks a closed set against a recognized line's per-segment *candidate lists*
 * instead of its greedy top-1 string: on low-fidelity captures the right
 * glyph often sits at rank 2-3 while the top-1 string is garbage. Alignment
 * is a weighted edit distance: matching a segment to a target char costs 1
 * minus that char's candidate score (1 when absent), insert/delete cost 1.
 * Scores land well below rankBy's for the same match quality, so the two
 * scales must not share thresholds.
 */
export function rankByRead<T>(
	segments: readonly ReadSegment[],
	entries: readonly T[],
	textOf: (entry: T) => string,
): ClosestMatch<T>[] {
	// per-segment candidate score by match key (max wins when keys collide,
	// e.g. dakuten variants folding onto one base kana)
	const segScores = segments.map((seg) => {
		const m = new Map<string, number>();
		for (const c of seg.candidates ?? []) {
			const k = matchKey(c.char);
			const s = Math.max(0, Math.min(1, c.score));
			if (s > (m.get(k) ?? 0)) m.set(k, s);
		}
		return m;
	});
	const n = segScores.length;
	return entries
		.map((entry) => {
			const t = matchKey(textOf(entry));
			const m = t.length;
			const dp = Array.from({ length: n + 1 }, () =>
				new Array<number>(m + 1).fill(0),
			);
			for (let i = 1; i <= n; i++) dp[i]![0] = i;
			for (let j = 1; j <= m; j++) dp[0]![j] = j;
			for (let i = 1; i <= n; i++) {
				for (let j = 1; j <= m; j++) {
					const sub = 1 - (segScores[i - 1]!.get(t[j - 1]!) ?? 0);
					dp[i]![j] = Math.min(
						dp[i - 1]![j]! + 1,
						dp[i]![j - 1]! + 1,
						dp[i - 1]![j - 1]! + sub,
					);
				}
			}
			return { entry, score: 1 - dp[n]![m]! / Math.max(n, m, 1) };
		})
		.sort((a, b) => b.score - a.score);
}
