import { describe, expect, test } from "vitest";
import * as Cooldowns from "./Cooldowns";

describe("Cooldowns.until", () => {
	test("is the end of a running cooldown", () => {
		Cooldowns.start(["running"], 1_000, 5_000);

		expect(Cooldowns.until("running", 5_500)).toBe(6_000);
	});

	test.each([
		{ why: "a key never cooled down", key: "never", now: 0 },
		{ why: "a cooldown that ran out", key: "ran-out", now: 6_000 },
	])("is null for $why", ({ key, now }) => {
		Cooldowns.start(["ran-out"], 1_000, 5_000);

		expect(Cooldowns.until(key, now)).toBeNull();
	});

	test("restarting a cooldown pushes its end back", () => {
		Cooldowns.start(["restarted"], 1_000, 5_000);
		Cooldowns.start(["restarted"], 1_000, 5_800);

		expect(Cooldowns.until("restarted", 6_200)).toBe(6_800);
	});
});
