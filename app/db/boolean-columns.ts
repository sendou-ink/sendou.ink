import type { SelectType } from "kysely";
import type { DB } from "./tables";

/** "Table.column" of every column typed `boolean` in tables.ts. */
type BooleanColumn = {
	[T in keyof DB & string]: {
		[C in keyof DB[T] & string]: NonNullable<
			SelectType<DB[T][C]>
		> extends boolean
			? `${T}.${C}`
			: never;
	}[keyof DB[T] & string];
}[keyof DB & string];

// a Record so the compiler checks the list both ways against the `boolean` columns of tables.ts
// xxx: once every flag column is typed `boolean`, drop `DBBoolean` and `toDBBoolean`
const BOOLEAN_COLUMN_FLAGS: Record<BooleanColumn, true> = {
	"ScrimPost.isScheduledForFuture": true,
	"ScrimPost.managedByAnyone": true,
	"ScrimPostRequest.isAccepted": true,
	"ScrimPostRequestUser.isOwner": true,
	"ScrimPostUser.isOwner": true,
	"Tournament.isFinalized": true,
	"User.commissionsOpen": true,
	"User.isApiAccesser": true,
	"User.isArtist": true,
	"User.isTournamentOrganizer": true,
	"User.isVideoAdder": true,
	"User.noScreen": true,
};

/**
 * Every "Table.column" stored as 0/1 that the dialect reads back as a `boolean` (writes convert
 * any `boolean` parameter). Columns join as they are typed `boolean` in tables.ts.
 */
export const BOOLEAN_COLUMNS: ReadonlySet<string> = new Set(
	Object.keys(BOOLEAN_COLUMN_FLAGS),
);
