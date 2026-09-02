/**
 * node:test-shaped `test` on top of Vitest, so the golden-file suites keep
 * their dynamic per-fixture tests with nested `t.test` subtests and `{ skip }`
 * options (no native Vitest equivalent). Subtests run inline; every failure is
 * collected and reported at once, so one field mismatch doesn't hide the next.
 */
import { test as vitestTest } from "vitest";

type SubtestBody = () => void | Promise<void>;

export interface CompatTestContext {
	test(name: string, fn: SubtestBody): Promise<void>;
	test(
		name: string,
		opts: { skip?: boolean | string },
		fn: SubtestBody,
	): Promise<void>;
}

export default function test(
	name: string,
	fn: (t: CompatTestContext) => void | Promise<void>,
): void {
	vitestTest(name, async () => {
		const failures: { name: string; error: unknown }[] = [];
		const subtest = async (
			subName: string,
			optsOrFn: { skip?: boolean | string } | SubtestBody,
			maybeFn?: SubtestBody,
		): Promise<void> => {
			const opts = typeof optsOrFn === "function" ? {} : optsOrFn;
			const body = typeof optsOrFn === "function" ? optsOrFn : maybeFn;
			if (opts.skip || !body) return;
			try {
				await body();
			} catch (error) {
				failures.push({ name: subName, error });
			}
		};
		const t: CompatTestContext = { test: subtest };
		await fn(t);
		if (failures.length === 0) return;
		if (failures.length === 1 && failures[0]) {
			const { name: subName, error } = failures[0];
			if (error instanceof Error) {
				error.message = `[${subName}] ${error.message}`;
				throw error;
			}
			throw new Error(`[${subName}] ${String(error)}`);
		}
		const summary = failures
			.map(
				({ name: subName, error }) =>
					`[${subName}] ${error instanceof Error ? error.message : String(error)}`,
			)
			.join("\n");
		const aggregate = new Error(
			`${failures.length} subtests failed:\n${summary}`,
		);
		const first = failures[0]?.error;
		if (first instanceof Error && first.stack) aggregate.stack = first.stack;
		throw aggregate;
	});
}
