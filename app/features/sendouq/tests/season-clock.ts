import { afterAll, beforeAll, vi } from "vitest";
import * as Seasons from "~/features/mmr/core/Seasons";
import invariant from "~/utils/invariant";

const startedSeasons = Seasons.list.filter(
	(season) => season.starts.getTime() <= Date.now(),
);
const latestStartedSeason = startedSeasons[startedSeasons.length - 1];
invariant(latestStartedSeason, "Expected at least one started season");

// the database stamps its own rows with the real "now", so a pinned time in the
// future would make every one of them look long expired
const insideASeason = new Date(
	Math.min(
		(latestStartedSeason.starts.getTime() +
			latestStartedSeason.ends.getTime()) /
			2,
		Date.now(),
	),
);

/** Pins the suite's clock inside a season; seasons are a fixed list, so between the last ending and the next being added such tests would otherwise fail. */
export function pinClockInsideSeason() {
	beforeAll(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(insideASeason);
	});

	afterAll(() => {
		vi.useRealTimers();
	});
}
