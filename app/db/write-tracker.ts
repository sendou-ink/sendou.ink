let dirty = false;

/** Marks the database written to; the dialect calls it before every write, so vitest teardown wipes only after a writing test and e2e workers flush caches only after factory writes. */
export function markDatabaseDirty() {
	dirty = true;
}

/** Whether the database has been written to since the last {@link markDatabaseClean}. */
export function isDatabaseDirty() {
	return dirty;
}

export function markDatabaseClean() {
	dirty = false;
}
