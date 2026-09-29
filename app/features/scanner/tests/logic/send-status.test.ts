import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	aggregateSendStatus,
	unsentMatches,
} from "../../components/sendou-ingest";
import type { ScanEvent } from "../../components/session-data";
import type { BuiltMatch } from "../../core/match-builder";
import type { ScannerMatch } from "../../core/scanner-match";
import type { SendStatus } from "../../store/events";

const NOW = 1_800_000_000_000;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe("aggregateSendStatus", () => {
	test("a send still in flight shows as sending", () => {
		const status = aggregateSendStatus([
			event({ state: "sending", at: NOW - 5_000 }),
		]);

		expect(status?.state).toBe("sending");
	});

	test("a send cut off mid-request shows as failed", () => {
		const status = aggregateSendStatus([
			event({ state: "sending", at: NOW - 5 * 60_000 }),
		]);

		expect(status?.state).toBe("failed");
		expect(status?.error).toBeDefined();
	});
});

describe("unsentMatches", () => {
	test.each([
		{ why: "never attempted", send: undefined, expected: true },
		{ why: "sent", send: { state: "sent", at: NOW }, expected: false },
		{
			why: "sending",
			send: { state: "sending", at: NOW - 5_000 },
			expected: false,
		},
		{
			why: "cut off mid-request",
			send: { state: "sending", at: NOW - 5 * 60_000 },
			expected: true,
		},
	] satisfies Array<{
		why: string;
		send: SendStatus | undefined;
		expected: boolean;
	}>)("$why", ({ send, expected }) => {
		expect(unsentMatches(built([event(send)]))).toBe(expected);
	});
});

function event(send: SendStatus | undefined): ScanEvent {
	return { type: "Scoreboard", t: 0, confidence: 1, data: null, send };
}

function built(sources: ScanEvent[]): BuiltMatch<ScanEvent> {
	return { match: {} as ScannerMatch, sources };
}
