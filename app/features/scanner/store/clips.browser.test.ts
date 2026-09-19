import { beforeEach, describe, expect, test } from "vitest";
import {
	type ClipToSave,
	deleteClip,
	deleteVodClips,
	listClips,
	MAX_HISTORY_CLIPS,
	rollSessionClipsIntoHistory,
	saveClip,
} from "./clips";

function clip(overrides: Partial<ClipToSave> = {}): ClipToSave {
	return {
		createdAt: 1_000,
		bucket: "session",
		source: { kind: "live", sessionKey: 1_000 },
		start: 90,
		end: 120,
		t: 116,
		time: 184,
		score: 16,
		kills: 4,
		mode: "SZ",
		stage: 0,
		hasAudio: true,
		...overrides,
	};
}

const BLOB = new Blob(["mp4"], { type: "video/mp4" });

async function clearAll() {
	for (const stored of await listClips()) await deleteClip(stored.id);
}

describe("rollSessionClipsIntoHistory()", () => {
	beforeEach(clearAll);

	test("moves the session's clips into history", async () => {
		await saveClip(clip(), BLOB);
		await saveClip(clip({ score: 25, kills: 5 }), BLOB);

		expect(await rollSessionClipsIntoHistory()).toBe(0);

		const stored = await listClips();
		expect(stored.map((c) => c.bucket)).toEqual(["history", "history"]);
		expect(stored.map((c) => c.score)).toEqual([25, 16]);
	});

	test("evicts the lowest-scoring clips beyond the cap, session clips competing equally", async () => {
		for (let i = 0; i < MAX_HISTORY_CLIPS; i++) {
			await saveClip(clip({ bucket: "history", score: 100 + i }), BLOB);
		}
		await saveClip(clip({ score: 50 }), BLOB);
		await saveClip(clip({ score: 500 }), BLOB);

		expect(await rollSessionClipsIntoHistory()).toBe(2);

		const stored = await listClips();
		expect(stored).toHaveLength(MAX_HISTORY_CLIPS);
		expect(stored[0]!.score).toBe(500);
		expect(stored.some((c) => c.score === 50)).toBe(false);
		expect(stored.some((c) => c.score === 100)).toBe(false);
	});

	test("leaves a file's clips out of history", async () => {
		await saveClip(
			clip({ bucket: "vod", source: { kind: "vod", name: "a.mkv" } }),
			BLOB,
		);

		await rollSessionClipsIntoHistory();

		expect((await listClips()).map((c) => c.bucket)).toEqual(["vod"]);
	});
});

describe("deleteVodClips()", () => {
	beforeEach(clearAll);

	test("drops one file's clips, or every file's", async () => {
		await saveClip(
			clip({ bucket: "vod", source: { kind: "vod", name: "a.mkv" } }),
			BLOB,
		);
		await saveClip(
			clip({ bucket: "vod", source: { kind: "vod", name: "b.mkv" } }),
			BLOB,
		);
		await saveClip(clip({ bucket: "history" }), BLOB);

		await deleteVodClips("a.mkv");
		expect(
			(await listClips())
				.map((c) => c.bucket)
				.toSorted((a, b) => a.localeCompare(b)),
		).toEqual(["history", "vod"]);

		await deleteVodClips();
		expect((await listClips()).map((c) => c.bucket)).toEqual(["history"]);
	});
});
