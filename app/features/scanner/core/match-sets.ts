/**
 * Divide a chronological run of ScannerMatches into sets — consecutive games
 * played by the same eight players (a Bo3/Bo5 between two teams). Rosters
 * are compared by in-game names pooled across both teams (scoreboards list
 * winners first, so team sides swap between games): names match fuzzily
 * because two OCR reads of the same name can differ by a glyph or two, and
 * one differing player is tolerated as a sub between games. A match with no
 * readable names is inconclusive and never opens a new set.
 */
import type { ScannerMatch } from "./scanner-match";
import { closestBy } from "./text";

/**
 * closestBy score two reads of the same name must reach — 0.7 forgives one
 * bad glyph on a four-letter name, two on longer ones.
 */
const SAME_NAME_SCORE = 0.7;

/** Players allowed to differ between consecutive games of one set. */
const MAX_SUBS_PER_GAME = 1;

/**
 * For each match its 1-based set number, aligned by index with the input;
 * matches must be in chronological order. Numbers only ever step up by one:
 * a match whose roster disagrees with the current set's opens the next set.
 */
export function assignMatchSets(matches: readonly ScannerMatch[]): number[] {
	const setNumbers: number[] = [];
	let setNumber = 1;
	let roster: string[] | null = null;
	for (const match of matches) {
		const names = rosterNames(match);
		if (names.length > 0) {
			if (roster !== null && !sameRoster(roster, names)) setNumber++;
			roster = names;
		}
		setNumbers.push(setNumber);
	}
	return setNumbers;
}

function rosterNames(match: ScannerMatch): string[] {
	return match.teams
		.flatMap((team) => team.players)
		.map((player) => player.name)
		.filter((name): name is string => name !== null);
}

/**
 * Whether two rosters read as the same eight players: every name of the
 * smaller roster must find a fuzzy partner in the other, short of
 * MAX_SUBS_PER_GAME misses. Partial reads compare only what both saw, so a
 * minimap-sourced half-roster still chains a set together.
 */
function sameRoster(a: readonly string[], b: readonly string[]): boolean {
	const remaining = [...b];
	let matched = 0;
	for (const name of a) {
		const best = closestBy(name, remaining, (entry) => entry);
		if (best && best.score >= SAME_NAME_SCORE) {
			matched++;
			remaining.splice(remaining.indexOf(best.entry), 1);
		}
	}
	return Math.min(a.length, b.length) - matched <= MAX_SUBS_PER_GAME;
}
