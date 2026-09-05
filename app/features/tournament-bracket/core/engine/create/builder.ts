import type {
	BracketData,
	Duel,
	GroupData,
	MatchData,
	ParticipantSlot,
	ResolvedCreateBracketInput,
	RoundData,
	Seeding,
	SeedOrdering,
	StageData,
	StageSettings,
	StandardBracketResults,
} from "../types";
import * as helpers from "./helpers";
import {
	defaultMinorOrdering,
	ordering,
	padSeedingToPowerOfTwo,
} from "./seeding";

/** Accumulates the rows of a stage being created, with local ids (0..n-1 per table). */
export class StageCreator {
	readonly input: ResolvedCreateBracketInput;
	settings: StageSettings;
	seeding: Seeding;
	readonly data: BracketData;

	constructor(input: ResolvedCreateBracketInput) {
		this.input = input;
		this.settings = structuredClone(input.settings) ?? {};
		const seeding = [...input.seeding];
		this.seeding =
			input.type !== "round_robin" ? padSeedingToPowerOfTwo(seeding) : seeding;
		this.data = { stage: [], group: [], round: [], match: [] };

		if (input.type === "single_elimination")
			this.settings.consolationFinal = this.settings.consolationFinal || false;
	}

	insertGroup(group: Omit<GroupData, "id">): number {
		const id = this.data.group.length;
		this.data.group.push({ id, ...group });
		return id;
	}

	insertRound(round: Omit<RoundData, "id">): number {
		const id = this.data.round.length;
		this.data.round.push({ id, ...round });
		return id;
	}

	insertMatch(match: Omit<MatchData, "id">): number {
		const id = this.data.match.length;
		this.data.match.push({ id, ...match });
		return id;
	}

	/** As many rounds as needed for each participant to play every other once. */
	createRoundRobinGroup(
		stageId: number,
		number: number,
		slots: ParticipantSlot[],
	): void {
		const groupId = this.insertGroup({
			stageId: stageId,
			number,
		});

		// padding slots (`null` from uneven teams, `undefined` from seed ordering) would become BYE rounds
		// that strand real matches in later rounds, so drop them. TBD slots (`{ id: null }`) are kept.
		const presentSlots = slots.filter(
			(slot) => slot !== null && slot !== undefined,
		);

		const rounds = helpers.makeRoundRobinMatches(presentSlots);

		for (let i = 0; i < rounds.length; i++)
			this.createRound(stageId, groupId, i + 1, rounds[0].length, rounds[i]);
	}

	/** Bipartite round-robin: every A team plays every B team exactly once. */
	createAbDivisionRoundRobinGroup(
		stageId: number,
		number: number,
		slotsA: ParticipantSlot[],
		slotsB: ParticipantSlot[],
	): void {
		const groupId = this.insertGroup({
			stageId: stageId,
			number,
		});

		const rounds = helpers.makeAbDivisionRoundRobinMatches(slotsA, slotsB);

		for (let i = 0; i < rounds.length; i++)
			this.createRound(stageId, groupId, i + 1, rounds[0].length, rounds[i]);
	}

	/** The only bracket in single elimination, the upper one in double elimination. */
	createStandardBracket(
		stageId: number,
		number: number,
		slots: ParticipantSlot[],
	): StandardBracketResults {
		const roundCount = helpers.getUpperBracketRoundCount(slots.length);
		const groupId = this.insertGroup({
			stageId: stageId,
			number,
		});

		let duels = helpers.makePairs(slots);
		let roundNumber = 1;

		const losers: ParticipantSlot[][] = [];

		for (let i = roundCount - 1; i >= 0; i--) {
			const matchCount = 2 ** i;
			duels = this.getCurrentDuels(duels, matchCount);
			losers.push(duels.map(helpers.byeLoser));
			this.createRound(stageId, groupId, roundNumber++, matchCount, duels);
		}

		return { losers, winner: helpers.byeWinner(duels[0]) };
	}

	/** Alternates major (regular) rounds and minor rounds where the major round's winners meet upper bracket losers. */
	createLowerBracket(
		stageId: number,
		number: number,
		losers: ParticipantSlot[][],
	): ParticipantSlot {
		const participantCount = this.seeding.length;
		const roundPairCount = helpers.getRoundPairCount(participantCount);

		let losersId = 0;

		const method = this.getMajorOrdering(participantCount);
		const ordered = ordering[method](losers[losersId++]);

		const groupId = this.insertGroup({
			stageId: stageId,
			number,
		});

		let duels = helpers.makePairs(ordered);
		let roundNumber = 1;

		for (let i = 0; i < roundPairCount; i++) {
			const matchCount = 2 ** (roundPairCount - i - 1);

			// Major round.
			duels = this.getCurrentDuels(duels, matchCount, true);
			this.createRound(stageId, groupId, roundNumber++, matchCount, duels);

			// Minor round.
			const minorOrdering = this.getMinorOrdering(
				participantCount,
				i,
				roundPairCount,
			);
			duels = this.getCurrentDuels(
				duels,
				matchCount,
				false,
				losers[losersId++],
				minorOrdering,
			);
			this.createRound(stageId, groupId, roundNumber++, matchCount, duels);
		}

		return helpers.byeWinnerToGrandFinal(duels[0]);
	}

	/** Rounds of 1 match each, used for finals. */
	createUniqueMatchBracket(
		stageId: number,
		number: number,
		duels: Duel[],
	): void {
		const groupId = this.insertGroup({
			stageId: stageId,
			number,
		});

		for (let i = 0; i < duels.length; i++)
			this.createRound(stageId, groupId, i + 1, 1, [duels[i]]);
	}

	createRound(
		stageId: number,
		groupId: number,
		roundNumber: number,
		matchCount: number,
		duels: Duel[],
	): void {
		const roundId = this.insertRound({
			number: roundNumber,
			stageId: stageId,
			groupId: groupId,
		});

		for (let i = 0; i < matchCount; i++) {
			this.createMatch(stageId, groupId, roundId, i + 1, duels[i]);
		}
	}

	createMatch(
		stageId: number,
		groupId: number,
		roundId: number,
		matchNumber: number,
		opponents: Duel,
	): void {
		const opponent1 = helpers.toResultWithPosition(opponents[0]);
		const opponent2 = helpers.toResultWithPosition(opponents[1]);

		// no BYE vs. BYE matches in round robin
		if (
			this.input.type === "round_robin" &&
			opponent1 === null &&
			opponent2 === null
		)
			return;

		this.insertMatch({
			number: matchNumber,
			stageId: stageId,
			groupId: groupId,
			roundId: roundId,
			opponent1,
			opponent2,
			winnerSide: null,
		});
	}

	/** No ordering for major rounds (the first round must be ordered beforehand), LB minor rounds use the given method. */
	getCurrentDuels(previousDuels: Duel[], currentDuelCount: number): Duel[];
	getCurrentDuels(
		previousDuels: Duel[],
		currentDuelCount: number,
		major: true,
	): Duel[];
	getCurrentDuels(
		previousDuels: Duel[],
		currentDuelCount: number,
		major: false,
		losers: ParticipantSlot[],
		method?: SeedOrdering,
	): Duel[];
	getCurrentDuels(
		previousDuels: Duel[],
		currentDuelCount: number,
		major?: boolean,
		losers?: ParticipantSlot[],
		method?: SeedOrdering,
	): Duel[] {
		if (
			(major === undefined || major) &&
			previousDuels.length === currentDuelCount
		) {
			// First round.
			return previousDuels;
		}

		if (major === undefined || major) {
			// From major to major (WB) or minor to major (LB).
			return helpers.transitionToMajor(previousDuels);
		}

		// From major to minor (LB). Losers and method won't be undefined.
		return helpers.transitionToMinor(previousDuels, losers!, method);
	}

	getSlots(): ParticipantSlot[] {
		helpers.ensureValidSize(this.input.type, this.seeding.length);
		helpers.ensureNoDuplicates(this.seeding);

		return this.getSlotsUsingIds(this.seeding);
	}

	private getSlotsUsingIds(seeding: Seeding): ParticipantSlot[] {
		return seeding.map((slot, i) => {
			if (slot === null) return null; // BYE.

			return { id: slot, position: i + 1 };
		});
	}

	/** The only major ordering for the lower bracket. */
	private getMajorOrdering(participantCount: number): SeedOrdering {
		return defaultMinorOrdering[participantCount]?.[0] || "natural";
	}

	private getMinorOrdering(
		participantCount: number,
		index: number,
		minorRoundCount: number,
	): SeedOrdering | undefined {
		// the last minor round has only one participant to order
		if (index === minorRoundCount - 1) return undefined;

		return defaultMinorOrdering[participantCount]?.[1 + index] || "natural";
	}

	createStage(): StageData {
		const stage: StageData = {
			id: 0,
			type: this.input.type,
			number: this.input.number ?? 1,
			settings: this.settings,
		};

		this.data.stage.push(stage);

		return stage;
	}
}
