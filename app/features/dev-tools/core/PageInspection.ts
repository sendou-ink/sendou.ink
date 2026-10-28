const MAX_DEPTH = 12;

export interface FoundPermissions {
	/** Where in the loader data the entity is, e.g. `tournament.ctx`. */
	path: string;
	/** A human readable hint of the entity: its name, title or id. */
	label: string | null;
	permissions: Record<string, number[]>;
}

/**
 * Every server computed `permissions` object (a record of permission name to user ids, see docs/dev/permissions.md)
 * found anywhere in the data, outermost first.
 */
export function findPermissions(data: unknown): FoundPermissions[] {
	const found: FoundPermissions[] = [];
	const seen = new Set<object>();

	const visit = (value: unknown, path: string, depth: number) => {
		if (typeof value !== "object" || value === null || depth > MAX_DEPTH) {
			return;
		}
		if (seen.has(value)) return;
		seen.add(value);

		if (Array.isArray(value)) {
			for (const [index, item] of value.entries()) {
				visit(item, `${path}[${index}]`, depth + 1);
			}
			return;
		}

		const record = value as Record<string, unknown>;
		if (isPermissionsObject(record.permissions)) {
			found.push({
				path: path || "(root)",
				label: entityLabel(record),
				permissions: record.permissions,
			});
		}

		for (const [key, child] of Object.entries(record)) {
			if (key === "permissions") continue;
			visit(child, path ? `${path}.${key}` : key, depth + 1);
		}
	};

	visit(data, "", 0);

	return found;
}

/** Size of the value as JSON in bytes, roughly what it weighs on the wire. */
export function jsonByteSize(value: unknown) {
	try {
		return new TextEncoder().encode(JSON.stringify(value) ?? "").length;
	} catch {
		return 0;
	}
}

/** Bytes as a short human readable string, e.g. `12.3 KB`. */
export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function isPermissionsObject(
	value: unknown,
): value is Record<string, number[]> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	const entries = Object.values(value);
	return (
		entries.length > 0 &&
		entries.every(
			(ids) => Array.isArray(ids) && ids.every((id) => typeof id === "number"),
		)
	);
}

function entityLabel(record: Record<string, unknown>) {
	for (const key of ["name", "title", "username", "id"]) {
		const value = record[key];
		if (typeof value === "string" || typeof value === "number") {
			return `${key}: ${value}`;
		}
	}

	return null;
}
