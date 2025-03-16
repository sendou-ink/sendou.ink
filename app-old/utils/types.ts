export function assertUnreachable(x: never): never {
	throw new Error(
		`Didn't expect to get here. Unexpected value: ${JSON.stringify(x)}`,
	);
}

/** @link https://stackoverflow.com/a/69413184 */
// @ts-expect-error helper to assert type to be another compile time
export const assertType = <A, B extends A>() => {};

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

export type UnwrappedNonNullable<T extends (...args: any) => any> = NonNullable<
	Unwrapped<T>
>;
