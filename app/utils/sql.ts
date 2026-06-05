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
