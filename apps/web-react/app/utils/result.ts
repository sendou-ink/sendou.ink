export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };

/** Discriminated union representing either a success (`Ok`) or a failure (`Err`). Narrow with the `ok` property. */
export type Result<T, E> = Ok<T> | Err<E>;

/** Creates an `Ok` variant of `Result` holding the success value. */
export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

/** Creates an `Err` variant of `Result` holding the error value. */
export function err<E>(error: E): Err<E> {
	return { ok: false, error };
}

/** Returns the success value, or the given default value if the result is an `Err`. */
export function unwrapOr<T, D>(
	result: Result<T, unknown>,
	defaultValue: D,
): T | D {
	return result.ok ? result.value : defaultValue;
}

/** Returns the success value. Throws if the result is an `Err`. */
export function unwrap<T>(result: Result<T, unknown>): T {
	if (!result.ok) {
		throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`);
	}

	return result.value;
}

/** Returns the error value. Throws if the result is an `Ok`. */
export function unwrapErr<E>(result: Result<unknown, E>): E {
	if (result.ok) {
		throw new Error("Expected Err, got Ok");
	}

	return result.error;
}
