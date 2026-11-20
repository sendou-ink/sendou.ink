/**
 * The session roster prior for player names: the same eight players recur
 * across the games of a set (and a set browsed in the battle log), so a name
 * one game misread is read right in the others. Each game's reading of a
 * player is voted on by the readings of the games where its team played, as
 * a weapon icon snaps to its closed set.
 *
 * What keeps a genuinely different name apart:
 *
 * - teams vote on each other only when at least `MIN_SHARED_PLAYERS` of their
 *   names pair up (and `MIN_IDENTICAL_NAMES` read identically, which spares
 *   the fuzzy pairing for teams of other lobbies), so a near-name in another
 *   lobby counts for nothing. Teams are linked one by one, not whole games: a
 *   set links both of its teams, a team's game against other opponents only
 *   that team, so the opponents of two games never vote on each other;
 * - names pair one to one per pair of teams, closest first, so a name never
 *   takes the spelling of another player of its own team;
 * - only a reading at `SNAP_MIN_SIMILARITY` or closer votes on a spelling
 *   (tail damage the pairing forgives is no vote: "Tee" is no misread "Teddy");
 * - a spelling wins only when more games read it than read the game's own,
 *   and more than read any other; a game never ends up with one name on two
 *   rows.
 *
 * Games vote by count, not by how well they read the name: a name's score
 * does not tell a misread from a hard name (glyph-twin misreads score
 * 0.84-0.92, correct names with odd glyphs from 0.62), and a lone reading
 * against a lone reading is a coin toss either way.
 */
import { isSameNameRead } from "./match-sets";
import { matchKey, nameSimilarity } from "./text";

/** Names two teams must share before they vote on each other's: all but one sub. */
const MIN_SHARED_PLAYERS = 3;

/** Names two teams must read identically before their names are paired at all. */
const MIN_IDENTICAL_NAMES = 2;

/** How close another game's reading must be to vote: one bad glyph in four letters. */
const SNAP_MIN_SIMILARITY = 0.7;

/** Games either side compared: a set runs up to seven, a battle log page shows ten. */
const WINDOW_GAMES = 10;

type Team = readonly (string | null)[];

/**
 * Each game's player names (per team, slots in a fixed order, null = unread),
 * team for team and slot for slot, with every reading the teams sharing its
 * players outvote replaced by their spelling (one reading per game). Games are
 * compared with the `WINDOW_GAMES` before and after them in the given
 * (chronological) order.
 */
export function snapNames(
	games: readonly (readonly Team[])[],
): (string | null)[][][] {
	const partners = games.map((teams) =>
		teams.map((team) =>
			team.map((): { game: number; team: number; slot: number }[] => []),
		),
	);
	const keys = games.map((teams) =>
		teams.map((team) =>
			team.map((name) => (name === null ? null : matchKey(name))),
		),
	);
	for (const [i, teams] of games.entries()) {
		for (let j = i + 1; j < Math.min(games.length, i + 1 + WINDOW_GAMES); j++) {
			for (const [ti, team] of teams.entries()) {
				for (const [tj, other] of games[j]!.entries()) {
					const pairs = pairedSlots(team, other, keys[i]![ti]!, keys[j]![tj]!);
					if (pairs.length < MIN_SHARED_PLAYERS) continue;
					for (const [a, b] of pairs) {
						partners[i]![ti]![a]!.push({ game: j, team: tj, slot: b });
						partners[j]![tj]![b]!.push({ game: i, team: ti, slot: a });
					}
				}
			}
		}
	}

	return games.map((teams, i) => {
		const proposed = teams.map((team, ti) =>
			team.map((name, slot) =>
				name === null
					? null
					: votedSpelling(
							name,
							partners[i]![ti]![slot]!.map(
								(partner) => games[partner.game]![partner.team]![partner.slot]!,
							),
						),
			),
		);
		const names = teams.flat();
		const spellings = proposed.flat();
		let flatSlot = 0;
		return teams.map((team, ti) =>
			team.map((name, slot) => {
				const own = flatSlot++;
				const spelling = proposed[ti]![slot]!;
				if (spelling === name) return name;
				const taken = spellings.some(
					(other, otherSlot) =>
						otherSlot !== own &&
						(other === spelling || names[otherSlot] === spelling),
				);
				return taken ? name : spelling;
			}),
		);
	});
}

/**
 * Slot pairs (a in `a`, b in `b`) reading as the same player, one to one,
 * the closest readings paired first; none for teams reading fewer than
 * `MIN_IDENTICAL_NAMES` names identically. `keysA`/`keysB` are the names'
 * `matchKey`s.
 */
function pairedSlots(
	a: readonly (string | null)[],
	b: readonly (string | null)[],
	keysA: readonly (string | null)[],
	keysB: readonly (string | null)[],
): [number, number][] {
	const usedA = new Set<number>();
	const usedB = new Set<number>();
	const pairs: [number, number][] = [];
	const pair = (i: number, j: number) => {
		usedA.add(i);
		usedB.add(j);
		pairs.push([i, j]);
	};

	for (const [i, key] of keysA.entries()) {
		if (key === null) continue;
		const j = keysB.findIndex(
			(other, slot) => other === key && !usedB.has(slot),
		);
		if (j !== -1) pair(i, j);
	}
	if (pairs.length < MIN_IDENTICAL_NAMES) return [];

	const candidates: { a: number; b: number; similarity: number }[] = [];
	for (const [i, nameA] of a.entries()) {
		if (nameA === null || usedA.has(i)) continue;
		for (const [j, nameB] of b.entries()) {
			if (nameB === null || usedB.has(j)) continue;
			if (!isSameNameRead(nameA, nameB)) continue;
			candidates.push({ a: i, b: j, similarity: nameSimilarity(nameA, nameB) });
		}
	}
	candidates.sort((x, y) => y.similarity - x.similarity);
	for (const candidate of candidates) {
		if (usedA.has(candidate.a) || usedB.has(candidate.b)) continue;
		pair(candidate.a, candidate.b);
	}
	return pairs;
}

/** The spelling more games read than read `own` or any other; `own` without one. */
function votedSpelling(own: string, others: readonly string[]): string {
	const votes = new Map<string, number>([[own, 1]]);
	for (const other of others) {
		if (nameSimilarity(own, other) < SNAP_MIN_SIMILARITY) continue;
		votes.set(other, (votes.get(other) ?? 0) + 1);
	}
	const [first, second] = [...votes].sort((a, b) => b[1] - a[1]);
	if (second && second[1] === first![1]) return own;
	return first![0];
}
