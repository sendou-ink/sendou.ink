import type { DBBoolean } from "#lib/server/db/tables.ts";

export function toDBBoolean(value: boolean): DBBoolean {
	return value ? 1 : 0;
}
