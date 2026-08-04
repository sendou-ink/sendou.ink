import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	AbilityType,
	AbilityWithUnknown,
	BuildAbilitiesTupleWithUnknown,
} from "~/modules/in-game-lists/types";
import { UNKNOWN_SHORT } from "../analyzer-constants";

/**
 * Serializes a build to a comma separated string for use in URLs.
 *
 * Lives in its own module (instead of `core/utils.ts`) so that URL-building
 * code can import it without pulling the weapon params data into the eager
 * bundle.
 */
export function serializeBuild(build: BuildAbilitiesTupleWithUnknown) {
	return build
		.flat()
		.map((ability) => (ability === "UNKNOWN" ? UNKNOWN_SHORT : ability))
		.join(",");
}

/** Reverses {@link serializeBuild}, returning null if the input is not a valid build. */
export function deserializeBuild(
	serialized: string,
): BuildAbilitiesTupleWithUnknown | null {
	const abilitiesArr = serialized.split(",");

	try {
		return [
			[
				validateAbility(["STACKABLE", "HEAD_MAIN_ONLY"], abilitiesArr[0]),
				validateAbility(["STACKABLE"], abilitiesArr[1]),
				validateAbility(["STACKABLE"], abilitiesArr[2]),
				validateAbility(["STACKABLE"], abilitiesArr[3]),
			],
			[
				validateAbility(["STACKABLE", "CLOTHES_MAIN_ONLY"], abilitiesArr[4]),
				validateAbility(["STACKABLE"], abilitiesArr[5]),
				validateAbility(["STACKABLE"], abilitiesArr[6]),
				validateAbility(["STACKABLE"], abilitiesArr[7]),
			],
			[
				validateAbility(["STACKABLE", "SHOES_MAIN_ONLY"], abilitiesArr[8]),
				validateAbility(["STACKABLE"], abilitiesArr[9]),
				validateAbility(["STACKABLE"], abilitiesArr[10]),
				validateAbility(["STACKABLE"], abilitiesArr[11]),
			],
		];
	} catch {
		return null;
	}
}

function validateAbility(
	legalTypes: Array<AbilityType>,
	ability?: string,
): AbilityWithUnknown {
	if (!ability) throw new Error("Ability missing");
	if (ability === UNKNOWN_SHORT) return "UNKNOWN";

	const abilityObj = abilities.find(
		(a) => a.name === ability && legalTypes.includes(a.type),
	);
	if (abilityObj) return abilityObj.name;

	throw new Error("Invalid ability");
}
