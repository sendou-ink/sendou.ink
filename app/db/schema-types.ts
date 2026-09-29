import type { SelectType } from "kysely";
import type { SCHEMA } from "./schema.gen";
import type { DB } from "./tables";

export type TableName = keyof DB & keyof typeof SCHEMA & string;

type Metadata<T extends TableName> = (typeof SCHEMA)[T];

export type IsView<T extends TableName> = Metadata<T>["kind"] extends "view"
	? true
	: false;

/** A row as selected, column types from `tables.ts`. */
export type Row<T extends TableName> = {
	[C in keyof DB[T]]: SelectType<DB[T][C]>;
};

/** Equality filter on any subset of the table's columns, `null` meaning `is null`. */
export type ColumnFilter<T extends TableName> = Partial<Row<T>>;

/** Filter naming every column of one unique key (the primary key included), so it matches at most one row. */
export type UniqueWhere<T extends TableName> = KeyFilter<
	T,
	Metadata<T>["uniqueKeys"][number]
>;

type KeyFilter<T extends TableName, Key> =
	Key extends ReadonlyArray<infer C extends keyof Row<T>>
		? Pick<Row<T>, C>
		: never;

/** One unique key's columns, for `on conflict`. */
export type UniqueKey<T extends TableName> = Metadata<T>["uniqueKeys"][number];

export type HasUniqueKey<T extends TableName> =
	Metadata<T>["uniqueKeys"] extends readonly [] ? false : true;

/** True for tables whose primary key is a single `id` column. */
export type HasIdPrimaryKey<T extends TableName> =
	Metadata<T>["primaryKey"] extends readonly ["id"] ? true : false;

/** Columns of `T` with a foreign key pointing at `Target`. */
export type ForeignKeysTo<T extends TableName, Target extends TableName> = {
	[C in keyof Metadata<T>["foreignKeys"]]: Metadata<T>["foreignKeys"][C] extends `${Target}.${string}`
		? C
		: never;
}[keyof Metadata<T>["foreignKeys"]] &
	keyof DB[T] &
	string;
