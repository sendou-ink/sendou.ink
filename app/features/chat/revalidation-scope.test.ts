import type { ShouldRevalidateFunctionArgs } from "react-router";
import { describe, expect, test } from "vitest";
import {
	isMatchResultsScopedRevalidation,
	revalidateWithScope,
} from "./revalidation-scope";

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
