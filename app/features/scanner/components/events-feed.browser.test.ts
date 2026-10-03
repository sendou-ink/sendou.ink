import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DetectedEvent } from "../core/detectors/types";
import {
	deleteEvents,
	listEvents,
	saveEvent,
	updateEventsSend,
} from "../store/events";
import { getFeed, refreshFeed, refreshFeedEvents } from "./events-feed";

const START = new Date(2030, 0, 1, 20, 0).getTime();

function mapStart(t: number): DetectedEvent {
	return {
		type: "MapStart",
		t,
		confidence: 0.9,
		data: { mode: "SZ", stage: 0 },
	};
}

function scoreboard(t: number): DetectedEvent {
	return {
		type: "Scoreboard",
		t,
		confidence: 0.9,
		data: {
			lobby: "PRIVATE",
			mode: "SZ",
			stage: 0,
			matchScores: [100, 47],
			povIndex: 0,
			players: [40, 1001, 2010, 3030, 50, 210, 4010, 8000].map(
				(weaponId, i) => ({
					name: `p${i}`,
					weaponId,
					paint: 1000 + i + t,
					ka: 10,
					d: 5,
					s: 2,
				}),
			),
		},
	};
}

async function saveAt(minutes: number, event: DetectedEvent): Promise<number> {
	vi.setSystemTime(START + minutes * 60_000);
	return saveEvent(event);
}

function newestSession() {
	return getFeed().sessions.at(-1)!;
}

describe("refreshFeed()", () => {
	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		await deleteEvents((await listEvents()).map((event) => event.id!));
		await refreshFeed(0);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("keeps a finished match as the same object when later events arrive", async () => {
		await saveAt(0, mapStart(0));
		await saveAt(5, scoreboard(300));
		vi.setSystemTime(START + 6 * 60_000);
		await refreshFeed();
		const [finished] = newestSession().built;

		await saveAt(7, mapStart(420));
		await saveAt(12, scoreboard(720));
		await refreshFeed();

		expect(newestSession().built).toHaveLength(2);
		expect(newestSession().built[0]).toBe(finished);
	});

	test("picks up a send status written to events outside the read window", async () => {
		const ids = [
			await saveAt(0, mapStart(0)),
			await saveAt(5, scoreboard(300)),
		];
		await saveAt(7, mapStart(420));
		await refreshFeed();

		vi.setSystemTime(START + 30 * 60_000);
		await updateEventsSend(ids, { state: "sent", at: Date.now() });
		await refreshFeedEvents(ids);

		const [sent] = newestSession().built;
		expect(sent!.sources.map((event) => event.send?.state)).toEqual([
			"sent",
			"sent",
		]);
	});
});
