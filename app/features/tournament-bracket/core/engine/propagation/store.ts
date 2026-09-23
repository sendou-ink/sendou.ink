import type {
	BracketData,
	MatchData,
	RoundData,
	RoundSection,
	StageData,
} from "../types";

/** Working copy of BracketData: rows handed out are live references into the clone, so mutating a row is the write. Callers report mutated match rows for the delta. */
export class Store {
	readonly data: BracketData;
	private readonly stagesById: Map<number, StageData>;
	private readonly roundsById: Map<number, RoundData>;
	private readonly matchesById: Map<number, MatchData>;
	private readonly roundsBySection: Map<string, RoundData[]>;
	private readonly matchesByRoundId: Map<number, MatchData[]>;
	private readonly changedMatchIds = new Set<number>();

	constructor(data: BracketData) {
		this.data = structuredClone(data);

		this.stagesById = indexById(this.data.stage);
		this.roundsById = indexById(this.data.round);
		this.matchesById = indexById(this.data.match);

		this.roundsBySection = groupByKey(this.data.round, (round) =>
			sectionKey(round.groupId, round.section),
		);
		this.matchesByRoundId = groupByKey(
			this.data.match,
			(match) => match.roundId,
		);
	}

	stageById(id: number): StageData | null {
		return this.stagesById.get(id) ?? null;
	}

	roundById(id: number): RoundData | null {
		return this.roundsById.get(id) ?? null;
	}

	matchById(id: number): MatchData | null {
		return this.matchesById.get(id) ?? null;
	}

	/** Round of a group's section, e.g. round 2 of the losers bracket. */
	roundByNumber(
		groupId: number,
		section: RoundSection | null,
		roundNumber: number,
	): RoundData | null {
		const rounds = this.roundsBySection.get(sectionKey(groupId, section));
		return rounds?.find((round) => round.number === roundNumber) ?? null;
	}

	matchByNumber(roundId: number, matchNumber: number): MatchData | null {
		const matches = this.matchesByRoundId.get(roundId);
		return matches?.find((match) => match.number === matchNumber) ?? null;
	}

	roundCountInSection(groupId: number, section: RoundSection | null): number {
		return this.roundsBySection.get(sectionKey(groupId, section))?.length ?? 0;
	}

	matchCountInRound(roundId: number): number {
		return this.matchesByRoundId.get(roundId)?.length ?? 0;
	}

	/** Records that a match row of this store was mutated. */
	markMatchChanged(match: MatchData): void {
		if (this.matchesById.get(match.id) !== match)
			throw new Error("Match is not a row of this store.");

		this.changedMatchIds.add(match.id);
	}

	/** Final version of every match row written during this operation. */
	changedMatches(): MatchData[] {
		return this.data.match.filter((match) =>
			this.changedMatchIds.has(match.id),
		);
	}
}

function sectionKey(groupId: number, section: RoundSection | null) {
	return `${groupId}-${section}`;
}

function indexById<T extends { id: number }>(rows: T[]): Map<number, T> {
	return new Map(rows.map((row) => [row.id, row]));
}

function groupByKey<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
	const result = new Map<K, T[]>();

	for (const row of rows) {
		const existing = result.get(key(row));
		if (existing) {
			existing.push(row);
		} else {
			result.set(key(row), [row]);
		}
	}

	return result;
}
