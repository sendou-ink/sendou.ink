import type { SelectType } from "kysely";
import type { DB } from "./tables";

/** "Table.column" of every column typed `Date` in tables.ts. */
type TimestampColumn = {
	[T in keyof DB & string]: {
		[C in keyof DB[T] & string]: NonNullable<SelectType<DB[T][C]>> extends Date
			? `${T}.${C}`
			: never;
	}[keyof DB[T] & string];
}[keyof DB & string];

// a Record so the compiler checks the list both ways against the `Date` columns of tables.ts
// xxx: once every `*At` column is typed `Date`, derive this from schema.gen.ts instead of listing columns
const TIMESTAMP_COLUMN_FLAGS: Record<TimestampColumn, true> = {
	"SpecialTrophyOwner.createdAt": true,
	"TrophySubmission.acceptedAt": true,
	"TrophySubmission.createdAt": true,
	"TrophySubmission.declinedAt": true,
	"TrophySubmissionApproval.createdAt": true,
	"Video.youtubePublishedAt": true,
};

/**
 * Every "Table.column" stored as unix seconds that the dialect reads back as a `Date` (writes
 * convert any `Date` parameter). Columns join as they are typed `Date` in tables.ts.
 */
export const TIMESTAMP_COLUMNS: ReadonlySet<string> = new Set(
	Object.keys(TIMESTAMP_COLUMN_FLAGS),
);
