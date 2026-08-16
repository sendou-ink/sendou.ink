import type { DBBoolean } from "~/db/tables";

/** Converts a JS boolean to the 0/1 representation SQLite stores booleans as. */
export function toDBBoolean(value: boolean): DBBoolean {
	return value ? 1 : 0;
}

export function errorIsSqliteForeignKeyConstraintFailure(
	error: unknown,
): error is Error {
	return (
		error instanceof Error &&
		error?.message?.includes("FOREIGN KEY constraint failed")
	);
}

export function errorIsSqliteUniqueConstraintFailure(
	error: unknown,
): error is Error {
	return (
		error instanceof Error &&
		error?.message?.includes("UNIQUE constraint failed")
	);
}
