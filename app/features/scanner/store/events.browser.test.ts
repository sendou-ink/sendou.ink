import { beforeEach, describe, expect, test } from "vitest";
import * as EventVersion from "../core/event-version";
import { stubEvent } from "../tests/stub-event";
import { EVENTS_STORE, tx } from "./db";
import {
	deleteEvents,
	getEvents,
	listEvents,
	loadEventFrame,
	type StoredEvent,
	saveEvent,
	updateEventsSend,
} from "./events";

const DEATH = stubEvent({
	type: "Death",
	t: 1,
	scores: { read: 1 },
	data: { name: "a" },
});

/** The event as version 1 stored it: one confidence, no stamp. */
const UNSTAMPED_DEATH = {
	type: "Death",
	t: 1,
	confidence: 0.8,
	data: { name: "a" },
} as unknown as StoredEvent;

const FRAME = new Blob([new Uint8Array(8)], { type: "image/webp" });

/** A record as some other version of the code left it in the store. */
function putRaw(record: StoredEvent): Promise<number> {
	return tx(
		EVENTS_STORE,
		"readwrite",
		(store) => store.put(record) as IDBRequest<number>,
	);
}

function getRaw(id: number): Promise<StoredEvent | undefined> {
	return tx(
		EVENTS_STORE,
		"readonly",
		(store) => store.get(id) as IDBRequest<StoredEvent | undefined>,
	);
}

async function clearAll() {
	const keys = await tx(
		EVENTS_STORE,
		"readonly",
		(store) => store.getAllKeys() as IDBRequest<number[]>,
	);
	await deleteEvents(keys);
}

describe("saveEvent()", () => {
	beforeEach(clearAll);

	test("stamps the event with the current event version", async () => {
		const id = await saveEvent(DEATH);

		expect((await getRaw(id))!.v).toBe(EventVersion.CURRENT);
	});

	test("keeps the stored frame of an event saved over as amended", async () => {
		const id = await saveEvent(DEATH, FRAME);

		await saveEvent(
			{ ...DEATH, data: { ...DEATH.data, name: "b" } },
			"kept",
			id,
		);

		const [stored] = await listEvents();
		expect(stored).toMatchObject({ id, hasFrame: true, data: { name: "b" } });
		expect(await loadEventFrame(id)).toBeDefined();
	});

	test("removes the stored frame of an event saved over without one", async () => {
		const id = await saveEvent(DEATH, FRAME);

		await saveEvent(DEATH, undefined, id);

		expect((await listEvents())[0]!.hasFrame).toBe(false);
		expect(await loadEventFrame(id)).toBeUndefined();
	});

	test("keeps no frame for an event that never had one", async () => {
		const id = await saveEvent(DEATH);

		await saveEvent(DEATH, "kept", id);

		expect((await listEvents())[0]!.hasFrame).toBe(false);
	});
});

describe("listEvents()", () => {
	beforeEach(clearAll);

	test("reads an event stored before the version stamp, its confidence as the score of the whole read", async () => {
		const id = await putRaw({ ...UNSTAMPED_DEATH, detectedAt: 1_000 });

		expect(await listEvents()).toEqual([
			{
				type: "Death",
				t: 1,
				scores: { "*": 0.8 },
				data: { name: "a" },
				v: EventVersion.CURRENT,
				id,
				detectedAt: 1_000,
			},
		]);
	});

	test("leaves out an event written by a newer version, keeping it stored", async () => {
		const id = await putRaw({
			...DEATH,
			v: EventVersion.CURRENT + 1,
			detectedAt: 1_000,
		});
		const readableId = await saveEvent(DEATH);

		expect((await listEvents()).map((event) => event.id)).toEqual([readableId]);
		expect((await getEvents([id, readableId])).map((e) => e.id)).toEqual([
			readableId,
		]);
		expect(await getRaw(id)).toBeDefined();
	});
});

describe("updateEventsSend()", () => {
	beforeEach(clearAll);

	test("keeps the version stamp of the events it rewrites", async () => {
		const unstamped = await putRaw({ ...UNSTAMPED_DEATH, detectedAt: 1_000 });
		const stamped = await saveEvent(DEATH);

		await updateEventsSend([unstamped, stamped], { state: "sent", at: 5 });

		expect((await getRaw(unstamped))!.v).toBeUndefined();
		expect((await getRaw(stamped))!.v).toBe(EventVersion.CURRENT);
	});
});
