import type { CommonUser } from "~/utils/kysely.server";

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

		for (let i = 0; i < Math.max(out.length, inn.length); i++) {
			if (out[i] && inn[i]) {
				result.push({
					side: side === "alpha" ? "ALPHA" : "BRAVO",
					playerOut: out[i],
					playerIn: inn[i],
				});
			}
		}
	}

	return result;
}
