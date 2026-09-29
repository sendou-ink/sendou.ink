import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	aggregateSendStatus,
	retryDueMatches,
	sendMatches,
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

describe("retryDueMatches", () => {
	test.each([
		{ why: "never attempted", send: undefined, expected: false },
		{ why: "sent", send: { state: "sent", at: NOW - 60_000 }, expected: false },
		{
			why: "unlinked, backoff not over",
			send: { state: "unlinked", at: NOW - 10_000, attempts: 1 },
			expected: false,
		},
		{
			why: "unlinked, backoff over",
			send: { state: "unlinked", at: NOW - 40_000, attempts: 1 },
			expected: true,
		},
		{
			why: "failed, backoff not over",
			send: { state: "failed", at: NOW - 10_000, attempts: 1 },
			expected: false,
		},
		{
			why: "failed, backoff over",
			send: { state: "failed", at: NOW - 40_000, attempts: 1 },
			expected: true,
		},
		{
			why: "failed, second backoff not over",
			send: { state: "failed", at: NOW - 40_000, attempts: 2 },
			expected: false,
		},
		{
			why: "failed before attempts were counted",
			send: { state: "failed", at: NOW - 40_000 },
			expected: true,
		},
		{
			why: "retries used up",
			send: { state: "failed", at: NOW - 60 * 60_000, attempts: 4 },
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
		expect(retryDueMatches(built([event(send)]))).toBe(expected);
	});
});

describe("sendMatches", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test.each([
		{ why: "first failure", previous: undefined, expected: 1 },
		{
			why: "failed again",
			previous: { state: "failed", at: NOW - 40_000, attempts: 1 },
			expected: 2,
		},
		{
			why: "unlinked, then failed",
			previous: { state: "unlinked", at: NOW - 40_000, attempts: 2 },
			expected: 3,
		},
		{
			why: "failed after a send that landed",
			previous: { state: "sent", at: NOW - 40_000 },
			expected: 1,
		},
	] satisfies Array<{
		why: string;
		previous: SendStatus | undefined;
		expected: number;
	}>)(
		"a failed send counts its attempt: $why",
		async ({ previous, expected }) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("deploying", { status: 503 })),
			);
			const writes: SendStatus[] = [];

			await sendMatches({
				matches: [built([event(previous)])],
				include: () => true,
				onStatus: () => {},
				writeSend: async (_matches, send) => {
					writes.push(send);
				},
			});

			expect(writes.at(-1)).toMatchObject({
				state: "failed",
				attempts: expected,
			});
		},
	);
});

function event(send: SendStatus | undefined): ScanEvent {
	return { type: "Scoreboard", t: 0, confidence: 1, data: null, send };
}

function built(sources: ScanEvent[]): BuiltMatch<ScanEvent> {
	return {
		match: { lobby: null, winner: null, matchScores: null } as ScannerMatch,
		sources,
	};
}
