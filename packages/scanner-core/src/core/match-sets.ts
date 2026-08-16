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
import { matchKey, rankBy } from "./text";

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
 * smaller roster must find a partner in the other, short of
 * MAX_SUBS_PER_GAME misses. Partial reads compare only what both saw, so a
 * minimap-sourced half-roster still chains a set together.
 */
function sameRoster(a: readonly string[], b: readonly string[]): boolean {
	const remaining = [...b];
	let matched = 0;
	for (const name of a) {
		const partner = rankBy(name, remaining, (entry) => entry).find(
			({ entry, score }) =>
				score >= SAME_NAME_SCORE || sharedPrefixRead(name, entry),
		);
		if (partner) {
			matched++;
			remaining.splice(remaining.indexOf(partner.entry), 1);
		}
	}
	return Math.min(a.length, b.length) - matched <= MAX_SUBS_PER_GAME;
}

/**
 * Whether two reads of a name agree on a leading prefix long enough that the
 * difference reads as tail damage, not another player. CJK names run 2-4
 * glyphs, so a single truncated (れた → れ) or garbled (ほった → ほっ′`)
 * tail glyph sinks the edit-distance score below any usable threshold while
 * the OCR damage sits, as it nearly always does, at the end of the row.
 */
function sharedPrefixRead(a: string, b: string): boolean {
	const keyA = matchKey(a);
	const keyB = matchKey(b);
	const shorter = Math.min(keyA.length, keyB.length);
	if (shorter === 0) return false;
	let prefix = 0;
	while (prefix < shorter && keyA[prefix] === keyB[prefix]) prefix++;
	// a whole-read prefix is a truncation; a 2+ glyph prefix covering two
	// thirds of the shorter read is a solid read with a garbled tail
	return prefix === shorter || (prefix >= 2 && prefix * 3 >= shorter * 2);
}
