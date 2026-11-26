import { describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as ReplayCodes from "./ReplayCodes";

const uploadedAt = (iso: string) => dateToDatabaseTimestamp(new Date(iso));

describe("ReplayCodes.isViewable", () => {
	test.each([
		{
			why: "uploaded a day ago on the current patch",
			uploaded: "2026-08-25T12:00:00Z",
			now: "2026-08-26T12:00:00Z",
			expected: true,
		},
		{
			why: "just under 30 days old",
			uploaded: "2026-08-20T12:00:00Z",
			now: "2026-09-19T11:59:00Z",
			expected: true,
		},
		{
			why: "30 days old",
			uploaded: "2026-08-20T12:00:00Z",
			now: "2026-09-19T12:00:00Z",
			expected: false,
		},
		{
			why: "uploaded before the current patch came out",
			uploaded: "2026-11-17T12:00:00Z",
			now: "2026-11-19T12:00:00Z",
			expected: false,
		},
	])("$why: $expected", ({ uploaded, now, expected }) => {
		expect(
			ReplayCodes.isViewable({
				uploadedAt: uploadedAt(uploaded),
				now: new Date(now),
			}),
		).toBe(expected);
	});
});
