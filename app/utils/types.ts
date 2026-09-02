/** Exhaustiveness check for switches / discriminated unions; throws if reached. */
export function assertUnreachable(x: never): never {
	throw new Error(
		`Didn't expect to get here. Unexpected value: ${JSON.stringify(x)}`,
	);
}

/** @link https://stackoverflow.com/a/69413184 */
export const assertType = <A, _B extends A>() => {};

export type Unpacked<T> = T extends (infer U)[]
	? U
	: T extends (...args: unknown[]) => infer U
		? U
		: T extends Promise<infer U>
			? U
			: T;

export type Nullish<T> = T | null | undefined;

export type Unwrapped<T extends (...args: any) => any> = Unpacked<
	Awaited<ReturnType<T>>
>;
