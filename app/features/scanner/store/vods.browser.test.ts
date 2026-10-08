import { beforeEach, describe, expect, test } from "vitest";
import { sessionSummary } from "../core/sessions";
import { deleteVod, listVods, loadVodMinimaps, saveVod } from "./vods";

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
