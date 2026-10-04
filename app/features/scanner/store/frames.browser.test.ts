import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DetectedEvent } from "../core/detectors/types";
import { sessionSummary } from "../core/sessions";
import { deleteEvents, listEvents, loadEventFrame, saveEvent } from "./events";
import { trimFrames } from "./frames";
import {
	deleteVod,
	listVods,
	loadVodEventFrame,
	loadVodEvents,
	saveVod,
} from "./vods";

const START = new Date(2030, 0, 1, 20, 0).getTime();
const HOUR = 60 * 60 * 1000;

const mapStart: DetectedEvent = {
	type: "MapStart",
	t: 0,
	confidence: 0.9,
	data: { mode: "SZ", stage: 0 },
};

function frameOf(bytes: number): Blob {
	return new Blob([new Uint8Array(bytes)], { type: "image/webp" });
}

async function saveLiveAt(at: number, bytes: number): Promise<number> {
	vi.setSystemTime(at);
	return saveEvent(mapStart, frameOf(bytes));
}

async function liveHasFrame(id: number): Promise<boolean> {
	const event = (await listEvents()).find((e) => e.id === id);
	const frame = await loadEventFrame(id);
	expect(event?.hasFrame ?? false).toBe(frame !== undefined);
	return frame !== undefined;
}

describe("trimFrames", () => {
	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(START);
		await deleteEvents((await listEvents()).map((event) => event.id!));
		for (const vod of await listVods()) await deleteVod(vod.name);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("drops frames older than three days and marks their events frameless", async () => {
		const old = await saveLiveAt(START, 10);
		const recent = await saveLiveAt(START + 48 * HOUR, 10);

		vi.setSystemTime(START + 73 * HOUR);
		await trimFrames();

		expect(await liveHasFrame(old)).toBe(false);
		expect(await liveHasFrame(recent)).toBe(true);
	});

	test("keeps the newest frames within the byte budget", async () => {
		const oldest = await saveLiveAt(START, 40);
		const middle = await saveLiveAt(START + HOUR, 40);
		const newest = await saveLiveAt(START + 2 * HOUR, 40);

		await trimFrames(100);

		expect(await liveHasFrame(oldest)).toBe(false);
		expect(await liveHasFrame(middle)).toBe(true);
		expect(await liveHasFrame(newest)).toBe(true);
	});

	test("shares the budget between live and VoD frames, dating a VoD's by its save", async () => {
		const live = await saveLiveAt(START, 40);
		vi.setSystemTime(START + HOUR);
		await saveVod(
			{
				name: "game.mp4",
				savedAt: Date.now(),
				duration: 60,
				summary: sessionSummary([]),
			},
			[{ ...mapStart, frame: frameOf(80) }],
		);

		await trimFrames(100);

		const [vodEvent] = await loadVodEvents("game.mp4");
		expect(await liveHasFrame(live)).toBe(false);
		expect(vodEvent?.hasFrame).toBe(true);
		expect(await loadVodEventFrame(vodEvent!.id!)).toBeDefined();
	});
});
