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
			clip({
				bucket: "vod",
				source: { kind: "vod", name: "a.mkv", visit: "v" },
			}),
			BLOB,
		);

		await rollSessionClipsIntoHistory();

		expect((await listClips()).map((c) => c.bucket)).toEqual(["vod"]);
	});
});

describe("deleteVodClips()", () => {
	beforeEach(clearAll);

	test("drops the clips it picks", async () => {
		await saveClip(
			clip({
				bucket: "vod",
				source: { kind: "vod", name: "a.mkv", visit: "v" },
			}),
			BLOB,
		);
		await saveClip(
			clip({
				bucket: "vod",
				source: { kind: "vod", name: "b.mkv", visit: "v" },
			}),
			BLOB,
		);
		await saveClip(clip({ bucket: "history" }), BLOB);

		await deleteVodClips(
			(c) => c.source.kind === "vod" && c.source.name === "a.mkv",
		);
		expect(
			(await listClips())
				.map((c) => c.bucket)
				.toSorted((a, b) => a.localeCompare(b)),
		).toEqual(["history", "vod"]);

		await deleteVodClips(() => true);
		expect((await listClips()).map((c) => c.bucket)).toEqual(["history"]);
	});
});

describe("saveClip()", () => {
	beforeEach(clearAll);

	const MAX_BYTES = BLOB.size * 2;

	test("drops the group's lowest-scoring clips to stay under the byte budget", async () => {
		await saveClip(clip({ score: 10 }), BLOB, { maxBytes: MAX_BYTES });
		await saveClip(clip({ bucket: "history", score: 20 }), BLOB, {
			maxBytes: MAX_BYTES,
		});

		const saved = await saveClip(clip({ score: 30 }), BLOB, {
			maxBytes: MAX_BYTES,
		});

		expect(saved?.bytes).toBe(BLOB.size);
		expect((await listClips()).map((c) => c.score)).toEqual([30, 20]);
	});

	test("saves nothing when the clip scores below a full budget", async () => {
		await saveClip(clip({ score: 20 }), BLOB, { maxBytes: MAX_BYTES });
		await saveClip(clip({ score: 30 }), BLOB, { maxBytes: MAX_BYTES });

		expect(
			await saveClip(clip({ score: 10 }), BLOB, { maxBytes: MAX_BYTES }),
		).toBeNull();
		expect((await listClips()).map((c) => c.score)).toEqual([30, 20]);
	});

	test("keeps a file's clips out of the live clips' budget", async () => {
		await saveClip(clip({ score: 20 }), BLOB, { maxBytes: MAX_BYTES });
		await saveClip(clip({ score: 30 }), BLOB, { maxBytes: MAX_BYTES });

		await saveClip(
			clip({
				bucket: "vod",
				source: { kind: "vod", name: "a.mkv", visit: "v" },
				score: 100,
			}),
			BLOB,
			{ maxBytes: MAX_BYTES },
		);

		expect((await listClips()).map((c) => c.score)).toEqual([100, 30, 20]);
	});
});
