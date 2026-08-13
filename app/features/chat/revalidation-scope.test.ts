import type { ShouldRevalidateFunctionArgs } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	isMatchResultsScopedRevalidation,
	revalidateWithScope,
	scheduleBroadcastRevalidation,
} from "./revalidation-scope";

const PENDING_REVALIDATION_STALE_MS = 30 * 1000;

const revalidationArgs = () =>
	({
		currentUrl: new URL("https://sendou.ink/to/1/brackets"),
		nextUrl: new URL("https://sendou.ink/to/1/brackets"),
		defaultShouldRevalidate: true,
		formMethod: undefined,
	}) as unknown as ShouldRevalidateFunctionArgs;

const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
};

const flushMicrotasks = () => new Promise<void>((res) => setTimeout(res));

describe("revalidateWithScope", () => {
	test("scope is active while a scoped revalidation is in flight and cleared after", async () => {
		const { promise, resolve } = deferred();

		revalidateWithScope(() => promise, "MATCH_RESULTS");
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(true);

		resolve();
		await flushMicrotasks();
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(false);
	});

	test("no scope is active for an unscoped revalidation", async () => {
		const { promise, resolve } = deferred();

		revalidateWithScope(() => promise, undefined);
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(false);

		resolve();
		await flushMicrotasks();
	});

	test("a scoped revalidation does not narrow an unscoped one in flight", async () => {
		const unscoped = deferred();
		const scoped = deferred();

		revalidateWithScope(() => unscoped.promise, undefined);
		revalidateWithScope(() => scoped.promise, "MATCH_RESULTS");
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(false);

		unscoped.resolve();
		scoped.resolve();
		await flushMicrotasks();
	});

	test("an unscoped revalidation broadens a scoped one in flight", async () => {
		const scoped = deferred();
		const unscoped = deferred();

		revalidateWithScope(() => scoped.promise, "MATCH_RESULTS");
		revalidateWithScope(() => unscoped.promise, undefined);
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(false);

		scoped.resolve();
		unscoped.resolve();
		await flushMicrotasks();
	});
});

describe("scheduleBroadcastRevalidation", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.runAllTimers();
		vi.useRealTimers();
	});

	test("revalidates once after a delay instead of immediately", () => {
		const revalidate = vi.fn(() => Promise.resolve());

		scheduleBroadcastRevalidation(revalidate, undefined);
		expect(revalidate).not.toHaveBeenCalled();

		vi.runAllTimers();
		expect(revalidate).toHaveBeenCalledTimes(1);
	});

	test("broadcasts arriving while one is scheduled are absorbed into it", () => {
		const revalidate = vi.fn(() => Promise.resolve());

		scheduleBroadcastRevalidation(revalidate, undefined);
		scheduleBroadcastRevalidation(revalidate, undefined);
		scheduleBroadcastRevalidation(revalidate, undefined);

		vi.runAllTimers();
		expect(revalidate).toHaveBeenCalledTimes(1);
	});

	test("same-scope broadcasts keep the scope active during the revalidation", () => {
		const { promise, resolve } = deferred();

		scheduleBroadcastRevalidation(() => promise, "MATCH_RESULTS");
		scheduleBroadcastRevalidation(() => promise, "MATCH_RESULTS");

		vi.runAllTimers();
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(true);

		resolve();
	});

	test("an absorbed unscoped broadcast widens the scheduled scope", () => {
		const { promise, resolve } = deferred();

		scheduleBroadcastRevalidation(() => promise, "MATCH_RESULTS");
		scheduleBroadcastRevalidation(() => promise, undefined);

		vi.runAllTimers();
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(false);

		resolve();
	});

	test("a scoped broadcast does not narrow an unscoped revalidation still in flight", async () => {
		// let anything still in flight from an earlier test settle first
		await vi.runAllTimersAsync();

		const unscoped = deferred();
		revalidateWithScope(() => unscoped.promise, undefined);

		scheduleBroadcastRevalidation(() => Promise.resolve(), "MATCH_RESULTS");
		vi.runAllTimers();
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(false);

		unscoped.resolve();
		await vi.runAllTimersAsync();
	});

	test("a scope left stuck by a never settling revalidation is forgotten once stale", async () => {
		// let anything still in flight from an earlier test settle first
		await vi.runAllTimersAsync();

		const neverSettles = new Promise<void>(() => {});

		// a revalidation interrupted by a navigation never settles
		revalidateWithScope(() => neverSettles, "MATCH_RESULTS");
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(true);

		await vi.advanceTimersByTimeAsync(PENDING_REVALIDATION_STALE_MS);

		const unscoped = deferred();
		scheduleBroadcastRevalidation(() => unscoped.promise, undefined);
		vi.runAllTimers();
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(false);

		unscoped.resolve();
		await vi.runAllTimersAsync();

		const scoped = deferred();
		scheduleBroadcastRevalidation(() => scoped.promise, "MATCH_RESULTS");
		vi.runAllTimers();
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(true);

		scoped.resolve();
		await vi.runAllTimersAsync();
		expect(isMatchResultsScopedRevalidation(revalidationArgs())).toBe(false);
	});
});
