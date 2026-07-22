import type {
	BracketData,
	GroupData,
	MatchData,
	RoundData,
	StageData,
} from "../types";

interface TableTypes {
	stage: StageData;
	group: GroupData;
	round: RoundData;
	match: MatchData;
}

type Table = keyof TableTypes;

/**
 * A working copy of BracketData with the same select/update semantics the old
 * storage had: selects return clones (in table order), updates replace the row
 * by id. Tracks which match rows were written so callers can emit a delta.
 */
export class Store {
	readonly data: BracketData;
	private readonly touchedMatchIds = new Set<number>();

	constructor(data: BracketData) {
		this.data = structuredClone(data);
	}

	select<T extends Table>(table: T, id: number): TableTypes[T] | null {
		const row = (this.data[table] as TableTypes[T][]).find((r) => r.id === id);
		return row ? structuredClone(row) : null;
	}

	selectAll<T extends Table>(
		table: T,
		filter: Partial<TableTypes[T]>,
	): TableTypes[T][] {
		return (this.data[table] as TableTypes[T][])
			.filter(makeFilter(filter))
			.map((row) => structuredClone(row));
	}

	selectFirst<T extends Table>(
		table: T,
		filter: Partial<TableTypes[T]>,
	): TableTypes[T] | null {
		const results = this.selectAll(table, filter);
		return results.length > 0 ? results[0] : null;
	}

	selectLast<T extends Table>(
		table: T,
		filter: Partial<TableTypes[T]>,
	): TableTypes[T] | null {
		const results = this.selectAll(table, filter);
		return results.length > 0 ? results[results.length - 1] : null;
	}

	updateMatch(match: MatchData): void {
		const index = this.data.match.findIndex((m) => m.id === match.id);
		if (index === -1) throw Error("Could not update the match.");

		this.data.match[index] = structuredClone(match);
		this.touchedMatchIds.add(match.id);
	}

	/** Returns the final version of every match row that was written during this operation. */
	changedMatches(): MatchData[] {
		return this.data.match.filter((match) =>
			this.touchedMatchIds.has(match.id),
		);
	}
}

function makeFilter<T extends object>(
	partial: Partial<T>,
): (row: T) => boolean {
	const entries = Object.entries(partial);
	return (row) =>
		entries.every(([key, value]) => row[key as keyof T] === value);
}
