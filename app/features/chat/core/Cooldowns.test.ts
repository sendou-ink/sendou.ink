import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

	describe("with local storage", () => {
		const storage = new Map<string, string>();

		beforeEach(() => {
			storage.clear();
			vi.stubGlobal("localStorage", {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => storage.set(key, value),
			});
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		test("reads a cooldown another tab started", () => {
			storage.set("chat__cooldowns", JSON.stringify({ "mention:1": 6_000 }));

			expect(Cooldowns.until("mention:1", 5_000)).toBe(6_000);
		});

		test("saves only the cooldowns still running", () => {
			Cooldowns.start(["old"], 1_000, 1_000);
			Cooldowns.start(["new"], 1_000, 5_000);

			expect(JSON.parse(storage.get("chat__cooldowns")!)).toEqual({
				new: 6_000,
			});
		});

		test("treats unreadable storage as no cooldowns", () => {
			storage.set("chat__cooldowns", "not json");

			expect(Cooldowns.until("mention:1", 5_000)).toBeNull();
		});
	});
});
