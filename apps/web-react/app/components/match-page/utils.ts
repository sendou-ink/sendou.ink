import * as R from "remeda";
import type { CommonUser } from "~/utils/kysely.server";
import { seededRandom } from "~/utils/random";

type MatchSide = "ALPHA" | "BRAVO";

type Rosters = {
	alpha: CommonUser[];
	bravo: CommonUser[];
};

export interface InferredSubstitution {
	side: MatchSide;
	playerOut: CommonUser;
	playerIn: CommonUser;
}

/**
 * Compares the rosters of two consecutive maps and pairs up any
 * players that dropped from a side with new players that joined the same side.
 * The pairs are returned in roster order, so the first player out is paired with
 * the first new player in. When the counts don't match, unpaired players are ignored.
 */
export function inferSubstitutions(
	previousRosters: Rosters,
	currentRosters: Rosters,
): InferredSubstitution[] {
	const result: InferredSubstitution[] = [];

	for (const side of ["alpha", "bravo"] as const) {
		const prevIds = new Set(previousRosters[side].map((u) => u.id));
		const currIds = new Set(currentRosters[side].map((u) => u.id));

		const out = previousRosters[side].filter((u) => !currIds.has(u.id));
		const inn = currentRosters[side].filter((u) => !prevIds.has(u.id));

		for (const [playerOut, playerIn] of R.zip(out, inn)) {
			result.push({
				side: side === "alpha" ? "ALPHA" : "BRAVO",
				playerOut,
				playerIn,
			});
		}
	}

	return result;
}

const NUM_MAP = {
	"1": ["1", "2", "4"],
	"2": ["2", "1", "3", "5"],
	"3": ["3", "2", "6"],
	"4": ["4", "1", "5", "7"],
	"5": ["5", "2", "4", "6", "8"],
	"6": ["6", "3", "5", "9"],
	"7": ["7", "4", "8"],
	"8": ["8", "7", "5", "9", "0"],
	"9": ["9", "6", "8"],
	"0": ["0", "8"],
};

/**
 * Generates a deterministic 4-digit Splatoon private battle room password based on the provided seed.
 *
 * Given the same seed, this function will always return the same password.
 */
export function resolveRoomPass(seed: number | string) {
	let pass = "5";
	for (let i = 0; i < 3; i++) {
		const { seededShuffle } = seededRandom(`${seed}-${i}`);

		const key = pass[i] as keyof typeof NUM_MAP;
		const opts = NUM_MAP[key];
		const next = seededShuffle(opts)[0];
		pass += next;
	}

	// prevent 5555 since many use it as a default pass
	// making it a bit more common guess
	if (pass === "5555") return "5800";

	return pass;
}
