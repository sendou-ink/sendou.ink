import { afterEach, describe, expect, test, vi } from "vitest";
import * as CalendarEventFactory from "~/db/seed/factories/CalendarEventFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { wrappedLoader } from "~/utils/Test";
import { type CalendarLoaderData, loader } from "./calendar.server";

const calendarLoader = wrappedLoader<CalendarLoaderData>({ loader });

const eventNames = (data: CalendarLoaderData) =>
	data.eventTimes.flatMap((time) => [
		...time.events.shown.map((event) => event.name),
		...time.events.hidden.map((event) => event.name),
	]);

describe("calendar loader default view", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	// The client resolves the shown week from the user's local clock while the
	// loader resolves the fetched week from the server's clock. Around the week
	// boundary these disagree by a full week for users ahead of UTC: e.g. in
	// Auckland (UTC+13) Monday 2026-01-12 10:00 local is still Sunday 2026-01-11
	// 21:00 UTC, so the user is shown the week Jan 12–18 but the loader only
	// fetches up to ~Jan 13. Events from Tuesday evening onwards are missing.
	test("fetches events for the whole week shown to a user ahead of UTC", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-11T21:00:00Z"));

		const author = await UserFactory.createRegular();
		await CalendarEventFactory.create({
			authorId: author.id,
			name: "Midweek Cup",
			tags: null,
			startTimes: [dateToDatabaseTimestamp(new Date("2026-01-14T06:00:00Z"))],
		});

		const data = await calendarLoader();

		expect(eventNames(data)).toContain("Midweek Cup");
	});

	test("control: same event is returned once the server clock reaches the same week", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-12T12:00:00Z"));

		const author = await UserFactory.createRegular();
		await CalendarEventFactory.create({
			authorId: author.id,
			name: "Midweek Cup",
			tags: null,
			startTimes: [dateToDatabaseTimestamp(new Date("2026-01-14T06:00:00Z"))],
		});

		const data = await calendarLoader();

		expect(eventNames(data)).toContain("Midweek Cup");
	});
});
