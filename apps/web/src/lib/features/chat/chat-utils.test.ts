import { addHours, subHours } from "date-fns";
import { describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "#lib/utils/dates.ts";
import { CHAT } from "./chat-constants.ts";
import { nextLifecycleChangeAt, roomLifecycle } from "./chat-utils.ts";

const NOW = new Date("2026-01-01T12:00:00Z");
const timestamp = (date: Date) => dateToDatabaseTimestamp(date);

describe("roomLifecycle", () => {
	test("is active when nothing schedules inactivity", () => {
		expect(roomLifecycle(null, NOW)).toBe("ACTIVE");
	});

	test("is active while inactivity is still in the future", () => {
		expect(roomLifecycle(timestamp(addHours(NOW, 1)), NOW)).toBe("ACTIVE");
	});

	test("is inactive between the inactivity and archival boundaries", () => {
		expect(roomLifecycle(timestamp(subHours(NOW, 1)), NOW)).toBe("INACTIVE");
	});

	test("is archived once the archival window elapsed", () => {
		const inactiveAt = subHours(NOW, CHAT.INACTIVE_TO_ARCHIVED_HOURS + 1);
		expect(roomLifecycle(timestamp(inactiveAt), NOW)).toBe("ARCHIVED");
	});
});

describe("nextLifecycleChangeAt", () => {
	test("returns null when nothing schedules inactivity", () => {
		expect(nextLifecycleChangeAt(null, NOW)).toBeNull();
	});

	test("returns the inactivity boundary while the room is active", () => {
		const inactiveAt = addHours(NOW, 1);
		expect(nextLifecycleChangeAt(timestamp(inactiveAt), NOW)).toEqual(
			inactiveAt,
		);
	});

	test("returns the archival boundary while the room is inactive", () => {
		const inactiveAt = subHours(NOW, 1);
		expect(nextLifecycleChangeAt(timestamp(inactiveAt), NOW)).toEqual(
			addHours(inactiveAt, CHAT.INACTIVE_TO_ARCHIVED_HOURS),
		);
	});

	test("returns null once the room is archived", () => {
		const inactiveAt = subHours(NOW, CHAT.INACTIVE_TO_ARCHIVED_HOURS + 1);
		expect(nextLifecycleChangeAt(timestamp(inactiveAt), NOW)).toBeNull();
	});
});
