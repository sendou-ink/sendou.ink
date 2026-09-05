import type {
	BracketData,
	GroupData,
	MatchData,
	RoundData,
	StageData,
} from "../types";

/** Working copy of BracketData: rows handed out are live references into the clone, so mutating a row is the write. Callers report mutated match rows for the delta. */
export class Store {
	readonly data: BracketData;
	private readonly stagesById: Map<number, StageData>;
	private readonly groupsById: Map<number, GroupData>;
	private readonly roundsById: Map<number, RoundData>;
	private readonly matchesById: Map<number, MatchData>;
	private readonly groupsByStageId: Map<number, GroupData[]>;
	private readonly roundsByGroupId: Map<number, RoundData[]>;
	private readonly matchesByRoundId: Map<number, MatchData[]>;
	private readonly changedMatchIds = new Set<number>();

	constructor(data: BracketData) {
		this.data = structuredClone(data);

		this.stagesById = indexById(this.data.stage);
		this.groupsById = indexById(this.data.group);
		this.roundsById = indexById(this.data.round);
		this.matchesById = indexById(this.data.match);

		this.groupsByStageId = groupByKey(
			this.data.group,
			(group) => group.stageId,
		);
		this.roundsByGroupId = groupByKey(
			this.data.round,
			(round) => round.groupId,
		);
		this.matchesByRoundId = groupByKey(
			this.data.match,
			(match) => match.roundId,
		);
	}

	stageById(id: number): StageData | null {
		return this.stagesById.get(id) ?? null;
	}

	groupById(id: number): GroupData | null {
		return this.groupsById.get(id) ?? null;
	}

	roundById(id: number): RoundData | null {
		return this.roundsById.get(id) ?? null;
	}

	matchById(id: number): MatchData | null {
		return this.matchesById.get(id) ?? null;
	}

	groupByNumber(stageId: number, groupNumber: number): GroupData | null {
		const groups = this.groupsByStageId.get(stageId);
		return groups?.find((group) => group.number === groupNumber) ?? null;
	}

	roundByNumber(groupId: number, roundNumber: number): RoundData | null {
		const rounds = this.roundsByGroupId.get(groupId);
		return rounds?.find((round) => round.number === roundNumber) ?? null;
	}

	matchByNumber(roundId: number, matchNumber: number): MatchData | null {
		const matches = this.matchesByRoundId.get(roundId);
		return matches?.find((match) => match.number === matchNumber) ?? null;
	}

	roundCountInGroup(groupId: number): number {
		return this.roundsByGroupId.get(groupId)?.length ?? 0;
	}

	matchCountInRound(roundId: number): number {
		return this.matchesByRoundId.get(roundId)?.length ?? 0;
	}

	/** Records that a match row of this store was mutated. */
	markMatchChanged(match: MatchData): void {
		if (this.matchesById.get(match.id) !== match)
			throw Error("Match is not a row of this store.");

		this.changedMatchIds.add(match.id);
	}

	/** Final version of every match row written during this operation. */
	changedMatches(): MatchData[] {
		return this.data.match.filter((match) =>
			this.changedMatchIds.has(match.id),
		);
	}
}

function indexById<T extends { id: number }>(rows: T[]): Map<number, T> {
	return new Map(rows.map((row) => [row.id, row]));
}

function groupByKey<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
	const result = new Map<number, T[]>();

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
