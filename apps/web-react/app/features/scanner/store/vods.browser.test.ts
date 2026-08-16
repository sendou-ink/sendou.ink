import { beforeEach, describe, expect, test } from "vitest";
import { deleteVod, listVods, saveVod, saveVodResultsSend } from "./vods";

const VOD_NAME = "results-send.mkv";

async function saveTestVod() {
	await saveVod({ name: VOD_NAME, savedAt: 1_000, duration: 60 }, [
		{ type: "scoreboard", t: 10, confidence: 0.9, data: {} },
	]);
}

async function storedVod() {
	return (await listVods()).find((vod) => vod.name === VOD_NAME);
}

describe("saveVodResultsSend()", () => {
	beforeEach(async () => {
		await deleteVod(VOD_NAME);
	});

	test("a saved scan has no send outcome", async () => {
		await saveTestVod();

		expect((await storedVod())?.resultsSend).toBeUndefined();
	});

	test("remembers the send outcome of a scan", async () => {
		await saveTestVod();
		await saveVodResultsSend(VOD_NAME, {
			sent: 2,
			total: 3,
			error: null,
			at: 5_000,
		});

		expect((await storedVod())?.resultsSend).toEqual({
			sent: 2,
			total: 3,
			error: null,
			at: 5_000,
		});
	});

	test("re-scanning the file forgets the send outcome", async () => {
		await saveTestVod();
		await saveVodResultsSend(VOD_NAME, {
			sent: 3,
			total: 3,
			error: null,
			at: 5_000,
		});
		await saveTestVod();

		expect((await storedVod())?.resultsSend).toBeUndefined();
	});
});
