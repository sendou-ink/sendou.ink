import { describe, expect, test } from "vitest";
import { cooldownUntil, startCooldowns } from "./chat-cooldowns";

describe("cooldownUntil", () => {
	test("is the end of a running cooldown", () => {
		startCooldowns(["running"], 1_000, 5_000);

		expect(cooldownUntil("running", 5_500)).toBe(6_000);
	});

	test.each([
		{ why: "a key never cooled down", key: "never", now: 0 },
		{ why: "a cooldown that ran out", key: "ran-out", now: 6_000 },
	])("is null for $why", ({ key, now }) => {
		startCooldowns(["ran-out"], 1_000, 5_000);

		expect(cooldownUntil(key, now)).toBeNull();
	});

	test("restarting a cooldown pushes its end back", () => {
		startCooldowns(["restarted"], 1_000, 5_000);
		startCooldowns(["restarted"], 1_000, 5_800);

		expect(cooldownUntil("restarted", 6_200)).toBe(6_800);
	});
});
