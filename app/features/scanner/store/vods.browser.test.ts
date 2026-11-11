import { beforeEach, describe, expect, test } from "vitest";
import * as EventVersion from "../core/event-version";
import { sessionSummary } from "../core/sessions";
import { tx, VOD_EVENTS_STORE } from "./db";
import {
	deleteVod,
	listVods,
	loadVodEvents,
	loadVodMinimaps,
	type StoredVodEvent,
	saveVod,
} from "./vods";

const NAME = "game.mp4";

function minimapAt(t: number) {
	return { t, image: new Blob([new Uint8Array(4)], { type: "image/webp" }) };
}

function saveWithMinimaps(name: string, ts: number[]): Promise<void> {
	return saveVod(
		{
			name,
			savedAt: Date.now(),
			duration: 60,
			summary: sessionSummary([]),
		},
		[],
		ts.map(minimapAt),
	);
}

async function minimapTimes(name: string): Promise<number[]> {
	return (await loadVodMinimaps(name)).map((minimap) => minimap.t);
}

const DEATH = { type: "Death", t: 1, confidence: 1, data: { name: "a" } };

/** A record as some other version of the code left it in the store. */
function putRawEvent(record: StoredVodEvent): Promise<number> {
	return tx(
		VOD_EVENTS_STORE,
		"readwrite",
		(store) => store.put(record) as IDBRequest<number>,
	);
}

describe("loadVodEvents", () => {
	beforeEach(async () => {
		for (const vod of await listVods()) await deleteVod(vod.name);
		await deleteVod(NAME);
	});

	test("stamps saved events with the current event version", async () => {
		await saveVod(
			{ name: NAME, savedAt: 0, duration: 60, summary: sessionSummary([]) },
			[DEATH],
		);

		expect((await loadVodEvents(NAME)).map((event) => event.v)).toEqual([
			EventVersion.CURRENT,
		]);
	});

	test("reads events stored before the version stamp and leaves out a newer version's", async () => {
		const id = await putRawEvent({ ...DEATH, vod: NAME });
		await putRawEvent({ ...DEATH, vod: NAME, v: EventVersion.CURRENT + 1 });

		expect(await loadVodEvents(NAME)).toEqual([{ ...DEATH, vod: NAME, id }]);
	});
});

describe("loadVodMinimaps", () => {
	beforeEach(async () => {
		for (const vod of await listVods()) await deleteVod(vod.name);
	});

	test("loads the VoD's minimaps chronologically", async () => {
		await saveWithMinimaps(NAME, [30, 10, 20]);
		await saveWithMinimaps("other.mp4", [15]);

		expect(await minimapTimes(NAME)).toEqual([10, 20, 30]);
	});

	test("a rescan replaces the earlier minimaps", async () => {
		await saveWithMinimaps(NAME, [10, 20]);
		await saveWithMinimaps(NAME, [5]);

		expect(await minimapTimes(NAME)).toEqual([5]);
	});

	test("deleting the VoD deletes its minimaps", async () => {
		await saveWithMinimaps(NAME, [10]);

		await deleteVod(NAME);

		expect(await minimapTimes(NAME)).toEqual([]);
	});
});
