/**
 * Unit tests for CheckThrottle: a detector with a check interval is checked
 * at most once per interval, timeline regressions reset the window, and
 * detectors without an interval are never throttled.
 */

import assert from "node:assert/strict";
import { CheckThrottle } from "../core/detectors/throttle";
import test from "./node-test-compat";

test("no interval means every frame is checked", () => {
	const throttle = new CheckThrottle();
	assert.equal(throttle.shouldCheck("scoreboard", 0, undefined), true);
	assert.equal(throttle.shouldCheck("scoreboard", 0.1, undefined), true);
	assert.equal(throttle.shouldCheck("scoreboard", 0.2, undefined), true);
});

test("frames inside the interval are skipped", () => {
	const throttle = new CheckThrottle();
	assert.equal(throttle.shouldCheck("objective", 10, 1), true);
	assert.equal(throttle.shouldCheck("objective", 10.5, 1), false);
	assert.equal(throttle.shouldCheck("objective", 10.99, 1), false);
	assert.equal(throttle.shouldCheck("objective", 11, 1), true);
	assert.equal(throttle.shouldCheck("objective", 11.5, 1), false);
});

test("a skipped frame does not push the next check later", () => {
	const throttle = new CheckThrottle();
	assert.equal(throttle.shouldCheck("objective", 0, 1), true);
	assert.equal(throttle.shouldCheck("objective", 0.9, 1), false);
	assert.equal(throttle.shouldCheck("objective", 1.1, 1), true);
});

test("a timeline regression resets the window", () => {
	const throttle = new CheckThrottle();
	assert.equal(throttle.shouldCheck("objective", 100, 1), true);
	// new capture session / VoD rescan starts its clock over
	assert.equal(throttle.shouldCheck("objective", 0.2, 1), true);
	assert.equal(throttle.shouldCheck("objective", 0.6, 1), false);
});

test("detectors are tracked independently", () => {
	const throttle = new CheckThrottle();
	assert.equal(throttle.shouldCheck("objective", 0, 1), true);
	assert.equal(throttle.shouldCheck("objective", 0.5, 1), false);
	assert.equal(throttle.shouldCheck("other", 0.5, 1), true);
});
