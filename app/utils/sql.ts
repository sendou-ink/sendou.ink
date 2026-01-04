export function errorIsSqliteUniqueConstraintFailure(
	error: unknown,
): error is { code: string } {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE"
	);
}

export function errorIsSqliteForeignKeyConstraintFailure(
	error: unknown,
): error is Error {
	return (
		error instanceof Error &&
		error?.message?.includes("FOREIGN KEY constraint failed")
	);
}

export function parseDBJsonArray<T extends Record<string, unknown>>(
	value: string,
): T[] {
	const parsed: T[] = JSON.parse(value);

	// If the returned array of JSON objects from DB is empty
	// it will be returned as object with all values being null
	// this is a (hacky) workaround for that
	return parsed.filter((item) =>
		Object.values(item).some((val) => val !== null),
	);
}

export function parseDBArray<T>(value: string): T[] {
	const parsed: T[] = JSON.parse(value);

	if (!parsed || (parsed.length === 1 && parsed[0] === null)) {
		return [];
	}

	return parsed;
}
