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
