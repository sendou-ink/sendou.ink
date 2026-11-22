import { describe, expect, test } from "vitest";
import type { SidebarEvent } from "~/features/sidebar/core/sidebar.server";
import * as UserEvents from "./UserEvents.server";

describe("UserEvents.goingTo", () => {
	test("leaves out scrim posts not yet booked and organization tournaments", () => {
		const events = UserEvents.goingTo(
			byCategory({
				scrims: [
					makeEvent({ id: 1, type: "scrim", scrimStatus: "booked" }),
					makeEvent({ id: 2, type: "scrim", scrimStatus: "looking" }),
					makeEvent({ id: 3, type: "scrim", scrimStatus: "requestPending" }),
				],
				organization: [makeEvent({ id: 4 })],
			}),
		);

		expect(events.map((event) => event.id)).toEqual([1]);
	});

	test("includes an event in several views once", () => {
		const tournament = makeEvent({ id: 1 });

		const events = UserEvents.goingTo(
			byCategory({ registered: [tournament], saved: [tournament] }),
		);

		expect(events).toHaveLength(1);
	});

	test("keeps events of different types sharing an id", () => {
		const events = UserEvents.goingTo(
			byCategory({
				registered: [makeEvent({ id: 1, type: "lobby" })],
				team: [makeEvent({ id: 1, type: "teamEvent" })],
			}),
		);

		expect(events).toHaveLength(2);
	});

	test("sorts by start time across views", () => {
		const events = UserEvents.goingTo(
			byCategory({
				registered: [makeEvent({ id: 1, startsAt: 300 })],
				hosting: [makeEvent({ id: 2, startsAt: 100 })],
				team: [makeEvent({ id: 3, type: "teamEvent", startsAt: 200 })],
			}),
		);

		expect(events.map((event) => event.id)).toEqual([2, 3, 1]);
	});
});

function byCategory(
	overrides: Partial<UserEvents.ByCategory>,
): UserEvents.ByCategory {
	return {
		registered: [],
		hosting: [],
		scrims: [],
		team: [],
		saved: [],
		organization: [],
		...overrides,
	};
}

function makeEvent(overrides: Partial<SidebarEvent> = {}): SidebarEvent {
	return {
		id: 1,
		name: "Event",
		url: "/",
		logoUrl: null,
		user: null,
		startsAt: 100,
		type: "tournament",
		...overrides,
	};
}
