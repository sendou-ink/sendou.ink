import { formatISO } from "date-fns";
import { databaseTimestampToDate } from "~/utils/dates";
import { PATCHES } from "../builds-constants";

/** Game patch (e.g. "11.2.0") that was current at the given database timestamp, null if older than every known patch. */
export function ofTimestamp(timestamp: number) {
	const isoDate = formatISO(databaseTimestampToDate(timestamp), {
		representation: "date",
	});

	return PATCHES.find(({ date }) => date <= isoDate)?.patch ?? null;
}
