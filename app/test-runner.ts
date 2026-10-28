/**
 * `bun:test` as test files import it (the ./test-console preload redirects their imports here), with `test` and
 * `it` reporting whether each test body passed so the console output of passing tests can be dropped.
 */
import * as BunTest from "bun:test";
import { reportTestOutcome } from "./test-console";

export * from "bun:test";

const MODIFIERS = ["skip", "only", "todo", "failing", "concurrent", "serial"];
const CONDITIONAL_MODIFIERS = ["if", "skipIf", "todoIf", "failingIf"];

export const test = reporting(BunTest.test);
export const it = test;

function reporting<T extends (...args: any[]) => any>(register: T): T {
	return new Proxy(register, {
		apply: (target, thisArg, args) =>
			Reflect.apply(target, thisArg, args.map(reportingIfBody)),
		get: (target, property, receiver) => {
			const value: unknown = Reflect.get(target, property, receiver);
			if (typeof value !== "function") return value;

			const method = value as (...args: any[]) => any;
			if (typeof property !== "string") return method.bind(target);
			if (MODIFIERS.includes(property)) return reporting(method);
			if (CONDITIONAL_MODIFIERS.includes(property) || property === "each") {
				return (...modifierArgs: unknown[]) =>
					reporting(method.apply(target, modifierArgs));
			}
			return method.bind(target);
		},
	});
}

function reportingIfBody(arg: unknown) {
	if (typeof arg !== "function") return arg;

	const body = arg as (...args: unknown[]) => unknown;
	const reportingBody = function (this: unknown, ...args: unknown[]) {
		try {
			const result = body.apply(this, args);
			if (result instanceof Promise) {
				return result.then(
					(value) => {
						reportTestOutcome("passed");
						return value;
					},
					(error) => {
						reportTestOutcome("failed");
						throw error;
					},
				);
			}
			reportTestOutcome("passed");
			return result;
		} catch (error) {
			reportTestOutcome("failed");
			throw error;
		}
	};
	// bun passes a `done` callback to bodies declaring a parameter for it
	Object.defineProperty(reportingBody, "length", { value: body.length });

	return reportingBody;
}
