import * as helpers from "../helpers";
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
import { MatchStatus } from "../types";
import {
	defaultMinorOrdering,
	ordering,
	padSeedingToPowerOfTwo,
} from "./seeding";

/**
 * Accumulates the rows of a stage being created. Pure port of the old
 * brackets-manager `Create` class: same call order, same inserted values, but
 * rows are collected into arrays with local ids (0..n-1 per table) instead of
 * being written to storage.
 */
export class StageCreator {
	readonly input: ResolvedCreateBracketInput;
	settings: StageSettings;
	seeding: Seeding;
	readonly data: BracketData;

	constructor(input: ResolvedCreateBracketInput) {
		if (!input.name) throw Error("You must provide a name for the stage.");

		if (!Number.isInteger(input.tournamentId))
			throw Error("You must provide a tournament id for the stage.");

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

	/**
	 * Creates a round-robin group.
	 *
	 * This will make as many rounds as needed to let each participant match every other once.
	 */
	createRoundRobinGroup(
		stageId: number,
		number: number,
		slots: ParticipantSlot[],
	): void {
		const groupId = this.insertGroup({
			stage_id: stageId,
			number,
		});

		// Groups can be padded with empty slots when teams don't divide evenly
		// (`null`) or by the seed ordering (`undefined`). An empty slot is just an
		// absent team, so drop it to round-robin only the present teams — otherwise
		// the padding becomes BYE rounds that strand real matches in later rounds.
		// TBD slots (`{ id: null }`) are kept; only nullish placeholders are removed.
		const presentSlots = slots.filter(
			(slot) => slot !== null && slot !== undefined,
		);

		const rounds = helpers.makeRoundRobinMatches(presentSlots);

		for (let i = 0; i < rounds.length; i++)
			this.createRound(stageId, groupId, i + 1, rounds[0].length, rounds[i]);
	}

	/**
	 * Creates a bipartite round-robin group where every A team plays every B team exactly once.
	 */
	createAbDivisionRoundRobinGroup(
		stageId: number,
		number: number,
		slotsA: ParticipantSlot[],
		slotsB: ParticipantSlot[],
	): void {
		const groupId = this.insertGroup({
			stage_id: stageId,
			number,
		});

		const rounds = helpers.makeAbDivisionRoundRobinMatches(slotsA, slotsB);

		for (let i = 0; i < rounds.length; i++)
			this.createRound(stageId, groupId, i + 1, rounds[0].length, rounds[i]);
	}

	/**
	 * Creates a standard bracket, which is the only one in single elimination and the upper one in double elimination.
	 *
	 * This will make as many rounds as needed to end with one winner.
	 */
	createStandardBracket(
		stageId: number,
		number: number,
		slots: ParticipantSlot[],
	): StandardBracketResults {
		const roundCount = helpers.getUpperBracketRoundCount(slots.length);
		const groupId = this.insertGroup({
			stage_id: stageId,
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

	/**
	 * Creates a lower bracket, alternating between major and minor rounds.
	 *
	 * - A major round is a regular round.
	 * - A minor round matches the previous (major) round's winners against upper bracket losers of the corresponding round.
	 */
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
			stage_id: stageId,
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

	/**
	 * Creates a bracket with rounds that only have 1 match each. Used for finals.
	 */
	createUniqueMatchBracket(
		stageId: number,
		number: number,
		duels: Duel[],
	): void {
		const groupId = this.insertGroup({
			stage_id: stageId,
			number,
		});

		for (let i = 0; i < duels.length; i++)
			this.createRound(stageId, groupId, i + 1, 1, [duels[i]]);
	}

	/**
	 * Creates a round, which contain matches.
	 */
	createRound(
		stageId: number,
		groupId: number,
		roundNumber: number,
		matchCount: number,
		duels: Duel[],
	): void {
		const roundId = this.insertRound({
			number: roundNumber,
			stage_id: stageId,
			group_id: groupId,
		});

		for (let i = 0; i < matchCount; i++) {
			this.createMatch(stageId, groupId, roundId, i + 1, roundNumber, duels[i]);
		}
	}

	/**
	 * Creates a match of the stage.
	 */
	createMatch(
		stageId: number,
		groupId: number,
		roundId: number,
		matchNumber: number,
		roundNumber: number,
		opponents: Duel,
	): void {
		const opponent1 = helpers.toResultWithPosition(opponents[0]);
		const opponent2 = helpers.toResultWithPosition(opponents[1]);

		// Round-robin matches can easily be removed. Prevent BYE vs. BYE matches.
		if (
			this.input.type === "round_robin" &&
			opponent1 === null &&
			opponent2 === null
		)
			return;

		let status = helpers.getMatchStatus(opponents);

		// In round-robin, only the first round is ready to play at the beginning.
		// other matches have teams set but they are busy playing the first round.
		if (
			this.input.type === "round_robin" &&
			roundNumber > 1 &&
			!this.settings.independentRounds
		) {
			status = MatchStatus.Locked;
		}

		this.insertMatch({
			number: matchNumber,
			stage_id: stageId,
			group_id: groupId,
			round_id: roundId,
			status,
			opponent1,
			opponent2,
		});
	}

	/**
	 * Gets the duels for the current round based on the previous one. No ordering is done for
	 * major rounds, it must be done beforehand for the first round. Ordering is done for LB
	 * minor rounds via the given method.
	 */
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

		// From major to minor (LB).
		// Losers and method won't be undefined.
		return helpers.transitionToMinor(previousDuels, losers!, method);
	}

	/**
	 * Returns the list of slots from the seeding.
	 *
	 * @param positions An optional list of positions (seeds) for a manual ordering.
	 */
	getSlots(positions?: number[]): ParticipantSlot[] {
		helpers.ensureValidSize(this.input.type, this.seeding.length);
		helpers.ensureNoDuplicates(this.seeding);

		return this.getSlotsUsingIds(this.seeding, positions);
	}

	/**
	 * Returns the list of slots with a seeding containing IDs.
	 */
	private getSlotsUsingIds(
		seeding: Seeding,
		positions?: number[],
	): ParticipantSlot[] {
		if (positions && positions.length !== seeding.length) {
			throw Error(
				"Not enough seeds in at least one group of the manual ordering.",
			);
		}

		const slots = seeding.map((slot, i) => {
			if (slot === null) return null; // BYE.

			return { id: slot, position: i + 1 };
		});

		if (!positions) return slots;

		return positions.map((position) => slots[position - 1]);
	}

	/**
	 * Returns the ordering method for the first round of the upper bracket of an elimination stage.
	 */
	getStandardBracketFirstRoundOrdering(): SeedOrdering {
		return "space_between";
	}

	/**
	 * The only major ordering for the lower bracket.
	 */
	private getMajorOrdering(participantCount: number): SeedOrdering {
		return defaultMinorOrdering[participantCount]?.[0] || "natural";
	}

	/**
	 * A minor ordering for the lower bracket by its index.
	 */
	private getMinorOrdering(
		participantCount: number,
		index: number,
		minorRoundCount: number,
	): SeedOrdering | undefined {
		// No ordering for the last minor round. There is only one participant to order.
		if (index === minorRoundCount - 1) return undefined;

		return defaultMinorOrdering[participantCount]?.[1 + index] || "natural";
	}

	/**
	 * Creates the stage row.
	 */
	createStage(): StageData {
		const stage: StageData = {
			id: 0,
			tournament_id: this.input.tournamentId,
			name: this.input.name,
			type: this.input.type,
			number: this.input.number ?? 1,
			settings: this.settings,
		};

		this.data.stage.push(stage);

		return stage;
	}
}
