import { type RawBuilder, sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { dateToDatabaseTimestamp } from "~/utils/dates";

/** Tables `backdate` can address: those with an `id` for it to key the update on. */
type BackdatableTable = {
	[T in keyof Tables]: "id" extends keyof Tables[T] ? T : never;
}[keyof Tables];

/** The only columns `backdate` may touch. */
type TimestampColumn<T extends BackdatableTable> = Extract<
	keyof Tables[T],
	`${string}At`
>;

/** Moves a row's timestamps into the past, since every production write stamps *now*. */
export async function backdate<T extends BackdatableTable>(
	table: T,
	id: number,
	timestamps: Partial<Record<TimestampColumn<T>, Date>>,
) {
	const assignments: RawBuilder<unknown>[] = [];

	for (const [column, date] of Object.entries(timestamps)) {
		// callers pass their own optional dates through unfiltered
		if (!date) continue;

		assignments.push(
			sql`${sql.ref(column)} = ${dateToDatabaseTimestamp(date as Date)}`,
		);
	}

	if (assignments.length === 0) return;

	await sql`update ${sql.table(table)} set ${sql.join(assignments)} where "id" = ${id}`.execute(
		db,
	);
}
