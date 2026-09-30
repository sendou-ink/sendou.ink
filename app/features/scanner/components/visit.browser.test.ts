import { beforeEach, describe, expect, test } from "vitest";
import {
	type ClipToSave,
	deleteClip,
	listClips,
	saveClip,
} from "../store/clips";
import { deleteClosedVisitsVodClips, VISIT_ID } from "./visit";

const BLOB = new Blob(["mp4"], { type: "video/mp4" });

function vodClip(visit: string): ClipToSave {
	return {
		createdAt: 1_000,
		bucket: "vod",
		source: { kind: "vod", name: "a.mkv", visit },
		start: 90,
		end: 120,
		t: 116,
		time: 184,
		score: 16,
		kills: 4,
		mode: "SZ",
		stage: 0,
		hasAudio: true,
	};
}

describe("deleteClosedVisitsVodClips()", () => {
	beforeEach(async () => {
		for (const stored of await listClips()) await deleteClip(stored.id);
	});

	test("keeps the clips of visits open in some tab and drops the rest", async () => {
		await saveClip(vodClip(VISIT_ID), BLOB);
		await saveClip(vodClip("other-tab"), BLOB);
		await saveClip(vodClip("closed-tab"), BLOB);
		const closeOtherTab = holdLock("scanner:visit:other-tab");

		await deleteClosedVisitsVodClips();
		closeOtherTab();

		const visits = (await listClips()).map((c) =>
			c.source.kind === "vod" ? c.source.visit : null,
		);
		expect(new Set(visits)).toEqual(new Set([VISIT_ID, "other-tab"]));
		expect(visits).toHaveLength(2);
	});
});

function holdLock(name: string): () => void {
	let release = () => {};
	void navigator.locks.request(
		name,
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	);
	return () => release();
}
