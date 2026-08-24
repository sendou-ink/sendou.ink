import { afterAll, beforeAll, vi } from "vitest";
import * as Seasons from "~/features/mmr/core/Seasons";
import invariant from "~/utils/invariant";

const lastSeason = Seasons.list[Seasons.list.length - 1];
invariant(lastSeason, "Expected at least one season");

const insideASeason = new Date(
	(lastSeason.starts.getTime() + lastSeason.ends.getTime()) / 2,
);

/**
 * Pins the suite's clock inside a season, for the tests whose subject only happens
 * while one is running. Seasons are a fixed list, so between the last one ending and
 * the next one being added every such test would otherwise fail.
 */
export function pinClockInsideSeason() {
	beforeAll(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(insideASeason);
	});

	afterAll(() => {
		vi.useRealTimers();
	});
}
