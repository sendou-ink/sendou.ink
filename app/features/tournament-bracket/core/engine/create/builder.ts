import type { SkippableRound } from "~/db/tables-json";
import * as SkippedRounds from "../../SkippedRounds";
import type {
	BracketData,
	Duel,
	GroupData,
	MatchData,
	ParticipantSlot,
	ResolvedCreateBracketInput,
	RoundData,
	RoundSection,
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
	/** Rounds skipped in the elimination group being created, see {@link createEliminationGroup}. */
	private groupSkippedRounds: SkippableRound[];

	constructor(input: ResolvedCreateBracketInput) {
		this.input = input;
		this.settings = structuredClone(input.settings) ?? {};
		const seeding = [...input.seeding];
		// grouped elimination pads each group instead
		const isPadded =
			input.type !== "round_robin" && (this.settings.groupCount ?? 1) <= 1;
		this.seeding = isPadded ? padSeedingToPowerOfTwo(seeding) : seeding;
		this.data = { stage: [], group: [], round: [], match: [] };
		this.groupSkippedRounds = this.settings.skippedRounds ?? [];

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
			stageId,
			number,
		});

		// padding slots (`null` from uneven teams, `undefined` from seed ordering) would become BYE rounds
		// that strand real matches in later rounds, so drop them. TBD slots (`{ id: null }`) are kept.
		const presentSlots = slots.filter(
			(slot) => slot !== null && slot !== undefined,
		);

		const rounds = helpers.makeRoundRobinMatches(presentSlots);

		for (let i = 0; i < rounds.length; i++)
			this.createRound(
				stageId,
				groupId,
				null,
				i + 1,
				rounds[0].length,
				rounds[i],
			);
	}

	/** Bipartite round-robin: every A team plays every B team exactly once. */
	createAbDivisionRoundRobinGroup(
		stageId: number,
		number: number,
		slotsA: ParticipantSlot[],
		slotsB: ParticipantSlot[],
	): void {
		const groupId = this.insertGroup({
			stageId,
			number,
		});

		const rounds = helpers.makeAbDivisionRoundRobinMatches(slotsA, slotsB);

		for (let i = 0; i < rounds.length; i++)
			this.createRound(
				stageId,
				groupId,
				null,
				i + 1,
				rounds[0].length,
				rounds[i],
			);
	}

	/**
	 * The winners section of an elimination group: the only bracket in single elimination, the upper one in double elimination.
	 * Skipped rounds are not created, but their losers and winner are still returned as the following sections are built off them.
	 */
	createStandardBracket(
		stageId: number,
		groupId: number,
		slots: ParticipantSlot[],
	): StandardBracketResults {
		const roundCount = helpers.getUpperBracketRoundCount(slots.length);
		const skipped = this.skippedRoundNumbers("winners", roundCount);

		let duels = helpers.makePairs(slots);
		let roundNumber = 1;

		const losers: ParticipantSlot[][] = [];

		for (let i = roundCount - 1; i >= 0; i--) {
			const matchCount = 2 ** i;
			duels = this.getCurrentDuels(duels, matchCount);
			losers.push(duels.map(helpers.byeLoser));
			if (!skipped.has(roundNumber)) {
				this.createRound(
					stageId,
					groupId,
					"winners",
					roundNumber,
					matchCount,
					duels,
				);
			}
			roundNumber++;
		}

		return { losers, winner: helpers.byeWinner(duels[0]) };
	}

	/** Alternates major (regular) rounds and minor rounds where the major round's winners meet upper bracket losers. */
	createLowerBracket(
		stageId: number,
		groupId: number,
		losers: ParticipantSlot[][],
		participantCount: number,
	): ParticipantSlot {
		const roundPairCount = helpers.getRoundPairCount(participantCount);
		const skipped = this.skippedRoundNumbers("losers", roundPairCount * 2);

		let losersId = 0;

		const method = this.getMajorOrdering(participantCount);
		const ordered = ordering[method](losers[losersId++]);

		let duels = helpers.makePairs(ordered);
		let roundNumber = 1;

		for (let i = 0; i < roundPairCount; i++) {
			const matchCount = 2 ** (roundPairCount - i - 1);

			// Major round.
			duels = this.getCurrentDuels(duels, matchCount, true);
			if (!skipped.has(roundNumber)) {
				this.createRound(
					stageId,
					groupId,
					"losers",
					roundNumber,
					matchCount,
					duels,
				);
			}
			roundNumber++;

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
			if (!skipped.has(roundNumber)) {
				this.createRound(
					stageId,
					groupId,
					"losers",
					roundNumber,
					matchCount,
					duels,
				);
			}
			roundNumber++;
		}

		return helpers.byeWinnerToGrandFinal(duels[0]);
	}

	/** The finals section: rounds of 1 match each (grand finals + bracket reset, or a consolation final). */
	createFinals(stageId: number, groupId: number, duels: Duel[]): void {
		const skipped = this.skippedRoundNumbers("finals", duels.length);

		for (let i = 0; i < duels.length; i++) {
			if (skipped.has(i + 1)) continue;

			this.createRound(stageId, groupId, "finals", i + 1, 1, [duels[i]]);
		}
	}

	/**
	 * Creates the rounds of one elimination group. If the skipped rounds would leave the group without
	 * a match, as few of them are played as needed, the earliest first.
	 */
	createEliminationGroup(
		type: "single_elimination" | "double_elimination",
		createRounds: () => void,
	): void {
		const skipped = this.settings.skippedRounds ?? [];
		const candidates = [
			skipped,
			...skipped.map((round) => SkippedRounds.withPlayed(type, skipped, round)),
			[],
		];

		const roundCountBefore = this.data.round.length;
		const matchCountBefore = this.data.match.length;
		for (const candidate of candidates) {
			this.data.round.length = roundCountBefore;
			this.data.match.length = matchCountBefore;
			this.groupSkippedRounds = candidate;

			createRounds();

			const hasMatch = this.data.match
				.slice(matchCountBefore)
				.some((match) => match.opponent1 && match.opponent2);
			if (hasMatch) break;
		}

		this.groupSkippedRounds = skipped;
	}

	/** Whether the round of the section is created, see {@link skippedRoundNumbers}. */
	isRoundCreated(
		section: RoundSection,
		roundNumber: number,
		roundCount: number,
	): boolean {
		return !this.skippedRoundNumbers(section, roundCount).has(roundNumber);
	}

	private skippedRoundNumbers(section: RoundSection, roundCount: number) {
		if (
			this.input.type !== "single_elimination" &&
			this.input.type !== "double_elimination"
		) {
			return new Set<number>();
		}

		return SkippedRounds.skippedRoundNumbers({
			type: this.input.type,
			section,
			roundCount,
			skipped: this.groupSkippedRounds,
		});
	}

	createRound(
		stageId: number,
		groupId: number,
		section: RoundSection | null,
		roundNumber: number,
		matchCount: number,
		duels: Duel[],
	): void {
		const roundId = this.insertRound({
			number: roundNumber,
			stageId,
			groupId,
			section,
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
			stageId,
			groupId,
			roundId,
			opponent1,
			opponent2,
			winnerSide: null,
		});
	}

	/** No ordering for major rounds (the first round must be ordered beforehand), LB minor rounds use the given method. */
	getCurrentDuels(
		previousDuels: Duel[],
		currentDuelCount: number,
		major?: true,
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

	/** Slots of each group of an elimination stage, distributed like round robin groups and each padded with BYEs to a power of two. */
	getEliminationGroupSlots(): ParticipantSlot[][] {
		const groupCount = this.settings.groupCount ?? 1;
		if (groupCount <= 1) return [this.getSlots()];

		helpers.ensureNoDuplicates(this.seeding);

		const ordered = ordering["groups.seed_optimized"](
			this.getSlotsUsingIds(this.seeding),
			groupCount,
		);

		return helpers.makeGroups(ordered, groupCount).map((group) => {
			// `undefined` = padding from seed ordering uneven groups
			const slots = group.filter((slot) => slot !== undefined);
			if (slots.length < 2) {
				throw new Error(
					"Impossible to create a group with less than 2 participants.",
				);
			}

			return padSeedingToPowerOfTwo(slots);
		});
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
