// Test-only harness giving the pure engine a stateful surface similar to the
// old BracketsManager, so the vendored test suite could be ported 1:1.

import * as Engine from "./index";
import type {
	BracketData,
	CreateBracketInput,
	GroupData,
	MatchData,
	ParticipantResult,
	RoundData,
	StageData,
} from "./types";

interface UpdateMatchInput {
	id: number;
	opponent1?: Partial<ParticipantResult>;
	opponent2?: Partial<ParticipantResult>;
	status?: number;
}

export class EngineBracket {
	data: BracketData | undefined;

	create(
		input: Omit<CreateBracketInput, "settings"> &
			Partial<Pick<CreateBracketInput, "settings">>,
	): void {
		const created = Engine.create({ ...input, settings: input.settings ?? {} });

		if (!this.data) {
			this.data = created;
			return;
		}

		// stack another stage into the same data set, offsetting the local ids
		// the same way the old library's storage assigned continuing ids
		const offsets = {
			stage: this.data.stage.length,
			group: this.data.group.length,
			round: this.data.round.length,
			match: this.data.match.length,
		};

		this.data = {
			stage: [
				...this.data.stage,
				...created.stage.map((stage) => ({
					...stage,
					id: stage.id + offsets.stage,
					number: input.number ?? offsets.stage + 1,
				})),
			],
			group: [
				...this.data.group,
				...created.group.map((group) => ({
					...group,
					id: group.id + offsets.group,
					stage_id: group.stage_id + offsets.stage,
				})),
			],
			round: [
				...this.data.round,
				...created.round.map((round) => ({
					...round,
					id: round.id + offsets.round,
					stage_id: round.stage_id + offsets.stage,
					group_id: round.group_id + offsets.group,
				})),
			],
			match: [
				...this.data.match,
				...created.match.map((match) => ({
					...match,
					id: match.id + offsets.match,
					stage_id: match.stage_id + offsets.stage,
					group_id: match.group_id + offsets.group,
					round_id: match.round_id + offsets.round,
				})),
			],
		};
	}

	reset(): void {
		this.data = undefined;
	}

	updateMatch(input: UpdateMatchInput, force?: boolean): void {
		this.data = Engine.reportResult(this.currentData(), {
			matchId: input.id,
			opponent1: input.opponent1,
			opponent2: input.opponent2,
			force,
		}).data;
	}

	resetMatchResults(matchId: number): void {
		this.data = Engine.resetMatchResults(this.currentData(), matchId).data;
	}

	stage(id = 0): StageData {
		const stage = this.currentData().stage.find((s) => s.id === id);
		if (!stage) throw Error(`Stage ${id} not found`);
		return stage;
	}

	groups(): GroupData[] {
		return this.currentData().group;
	}

	rounds(filter?: Partial<RoundData>): RoundData[] {
		return applyFilter(this.currentData().round, filter);
	}

	round(id: number): RoundData {
		const round = this.currentData().round.find((r) => r.id === id);
		if (!round) throw Error(`Round ${id} not found`);
		return round;
	}

	matches(filter?: Partial<MatchData>): MatchData[] {
		return applyFilter(this.currentData().match, filter);
	}

	match(id: number): MatchData {
		const match = this.currentData().match.find((m) => m.id === id);
		if (!match) throw Error(`Match ${id} not found`);
		return match;
	}

	private currentData(): BracketData {
		if (!this.data) throw Error("No bracket created");
		return this.data;
	}
}

function applyFilter<T extends object>(rows: T[], filter?: Partial<T>): T[] {
	if (!filter) return rows;

	const entries = Object.entries(filter);
	return rows.filter((row) =>
		entries.every(([key, value]) => row[key as keyof T] === value),
	);
}
