import { describe, expect, test } from "vitest";
import * as BracketFuzz from "../tests/BracketFuzz";

// FUZZ_SEED=bracket-fuzz-12 replays one seed, FUZZ_SEEDS=2000 widens the search
const SEED_COUNT = Number(process.env.FUZZ_SEEDS ?? 60);
const STEP_COUNT = 150;
const SEEDS = process.env.FUZZ_SEED
	? [process.env.FUZZ_SEED]
	: Array.from({ length: SEED_COUNT }, (_, i) => `bracket-fuzz-${i}`);

describe("random sequences of bracket actions", () => {
	test.each(SEEDS)(
		"keeps every invariant after every step (seed %s)",
		(seed) => {
			const failure = BracketFuzz.run(seed, STEP_COUNT);

			expect(failure ? BracketFuzz.describeFailure(failure) : null).toBeNull();
		},
	);
});
