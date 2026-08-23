/**
 * Unit tests for the live frame backlog's decimating eviction: which index
 * gets dropped, and the property the policy exists for — a long parse
 * stall keeps thinned coverage of its whole span instead of truncating to
 * the newest limit/fps seconds.
 */

import assert from "node:assert/strict";
import { frameEvictionIndex } from "../../worker/frame-queue";
import test from "../node-test-compat";

test("evicts the oldest of a backlog too short to thin", () => {
	assert.equal(frameEvictionIndex([]), 0);
	assert.equal(frameEvictionIndex([1]), 0);
	assert.equal(frameEvictionIndex([1, 2]), 0);
});

test("never evicts the endpoints", () => {
	assert.equal(frameEvictionIndex([0, 100, 200]), 1);
});

test("evicts from the densest stretch", () => {
	// 10..11 is dense; 0 and 30 anchor the span
	assert.equal(frameEvictionIndex([0, 10, 10.5, 11, 30]), 2);
});

test("uniform spacing evicts the first interior frame", () => {
	assert.equal(frameEvictionIndex([0, 1, 2, 3, 4]), 1);
});

test("a stall keeps thinned coverage of its whole span", () => {
	const limit = 24;
	const fps = 2;
	const stallS = 50;
	const queue: number[] = [];
	for (let time = 0; time <= stallS; time += 1 / fps) {
		queue.push(time);
		if (queue.length > limit) {
			queue.splice(frameEvictionIndex(queue), 1);
		}
	}
	assert.equal(queue.length, limit);
	assert.equal(queue[0], 0);
	assert.equal(queue.at(-1), stallS);
	let maxGap = 0;
	for (let i = 1; i < queue.length; i++) {
		maxGap = Math.max(maxGap, queue[i]! - queue[i - 1]!);
	}
	// drop-oldest would leave a 38.5s hole; decimation keeps every gap
	// small enough that a ~10s results screen retains multiple frames
	assert.ok(maxGap <= 4, `max gap ${maxGap}s`);
});
