/*------------------------------------------------------------|
 * Contains everything which is given by the user as input.
 *-----------------------------------------------------------*/

import type {
	GrandFinalType,
	RoundRobinMode,
	SeedOrdering,
	StageType,
} from "./unions";

/**
 * The seeding for a stage.
 *
 * Each element represents a participant, which can be:
 * - A full object, with possibly extra fields.
 * - Its name.
 * - Its ID.
 * - Or a BYE: `null`.
 */
export type Seeding = (number | null)[];

/**
 * Used to create a stage.
 */
export interface InputStage {
	/**
	 * ID of the parent tournament.
	 *
	 * Used to determine the `number` property of a stage related to a tournament.
	 */
	tournamentId: number;

	/** Name of the stage. */
	name: string;

	/** Type of stage. */
	type: StageType;

	/** The number of the stage in its tournament. Is determined if not given. */
	number?: number;

	/** Contains participants or `null` for BYEs. */
	seeding?: Seeding;

	/** Contains optional settings specific to each stage type. */
	settings?: StageSettings;
}

/**
 * The possible settings for a stage.
 */
export interface StageSettings {
	/**
	 * The number of participants.
	 */
	size?: number;

	/**
	 * A list of ordering methods to apply to the seeding.
	 *
	 * - For a round-robin stage: 1 item required (**with** `"groups."` prefix).
	 *   - Used to distribute in groups.
	 * - For a simple elimination stage, 1 item required (**without** `"groups."` prefix).
	 *   - Used to distribute in round 1.
	 * - For a double elimination stage, 1 item required, 3+ items supported (**without** `"groups."` prefix).
	 *   - Item 1 (required) - Used to distribute in WB round 1.
	 *   - Item 2 - Used to distribute WB losers in LB round 1.
	 *   - Items 3+ - Used to distribute WB losers in LB minor rounds (1 per round).
	 */
	seedOrdering?: SeedOrdering[];

	/**
	 * Whether to balance BYEs in the seeding of an elimination stage.
	 *
	 * This prevents having BYE against BYE in matches.
	 */
	balanceByes?: boolean;

	/**
	 * Number of groups in a round-robin stage.
	 */
	groupCount?: number;

	/**
	 * The mode for the round-robin stage.
	 *
	 * - If `simple`, each participant plays each opponent once.
	 * - If `double`, each participant plays each opponent twice, once at home and once away.
	 */
	roundRobinMode?: RoundRobinMode;

	/**
	 * A list of seeds per group for a round-robin stage to be manually ordered.
	 *
	 * Seed ordering is ignored if this property is given.
	 */
	manualOrdering?: number[][];

	/**
	 * Optional final between semi-final losers.
	 */
	consolationFinal?: boolean;

	/**
	 * Whether to skip the first round of the WB of a double elimination stage.
	 */
	skipFirstRound?: boolean;

	/**
	 * Optional grand final between WB and LB winners.
	 *
	 * - If `none`, there is no grand final.
	 * - If `simple`, the final is a single match. The winner is the winner of the stage.
	 * - If `double`, if the WB winner wins, he's the winner of the stage. But if he loses, the final is reset and there is a very last match.
	 * It might be fairer since it gives the WB winner the right to lose once during the stage...
	 */
	grandFinal?: GrandFinalType;

	swiss?: {
		groupCount: number;
		roundCount: number;
	};
}
