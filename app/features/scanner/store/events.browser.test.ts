import { beforeEach, describe, expect, test } from "vitest";
import * as EventVersion from "../core/event-version";
import { stubEvent } from "../tests/stub-event";
import { EVENTS_STORE, tx } from "./db";
import {
	deleteEvents,
	getEvents,
	listEvents,
	type StoredEvent,
	saveEvent,
	updateEventsSend,
} from "./events";

const DEATH = stubEvent({
	type: "Death",
	t: 1,
	confidence: 1,
	data: { name: "a" },
});

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
});

describe("listEvents()", () => {
	beforeEach(clearAll);

	test("reads an event stored before the version stamp", async () => {
		const id = await putRaw({ ...DEATH, detectedAt: 1_000 });

		expect(await listEvents()).toEqual([{ ...DEATH, id, detectedAt: 1_000 }]);
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
		const unstamped = await putRaw({ ...DEATH, detectedAt: 1_000 });
		const stamped = await saveEvent(DEATH);

		await updateEventsSend([unstamped, stamped], { state: "sent", at: 5 });

		expect((await getRaw(unstamped))!.v).toBeUndefined();
		expect((await getRaw(stamped))!.v).toBe(EventVersion.CURRENT);
	});
});
