export function errorIsSqliteUniqueConstraintFailure(error: any) {
	return error?.code === "SQLITE_CONSTRAINT_UNIQUE";
}

export function errorIsSqliteForeignKeyConstraintFailure(error: Error) {
	return error?.message?.includes("FOREIGN KEY constraint failed");
}

export function parseDBJsonArray(value: any) {
	const parsed = JSON.parse(value);

	// If the returned array of JSON objects from DB is empty
	// it will be returned as object with all values being null
	// this is a (hacky) workaround for that
	return parsed.filter((item: any) =>
		Object.values(item).some((val) => val !== null),
	);
}

export function parseDBArray(value: any) {
	const parsed = JSON.parse(value);

	if (!parsed || (parsed.length === 1 && parsed[0] === null)) {
		return [];
	}

	return parsed;
}

export function booleanToInt(value: boolean) {
	return value ? 1 : 0;
}
