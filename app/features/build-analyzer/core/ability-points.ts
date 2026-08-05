import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	Ability,
	AbilityWithUnknown,
	BuildAbilitiesTupleWithUnknown,
} from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { MAIN_SLOT_AP, SUB_SLOT_AP } from "../analyzer-constants";
import type { AbilityPoints } from "../analyzer-types";

/**
 * Sums a build's stackable ability points per ability, accounting for
 * Ability Doubler doubling the sub slots of its row. Main-only abilities are
 * left out as they have no ability point value.
 */
export function buildToAbilityPoints(build: BuildAbilitiesTupleWithUnknown) {
	const result: AbilityPoints = new Map();

	for (const abilityRow of build) {
		let abilityDoublerActive = false;
		for (const [i, ability] of abilityRow.entries()) {
			if (ability === "AD") {
				abilityDoublerActive = true;
			}
			if (!isStackableAbility(ability) && ability !== "UNKNOWN") {
				continue;
			}

			const aps = i === 0 ? MAIN_SLOT_AP : SUB_SLOT_AP;
			const apsDoubled = aps * (abilityDoublerActive ? 2 : 1);
			const newAp = (result.get(ability) ?? 0) + apsDoubled;

			result.set(ability, newAp);
		}
	}

	return result;
}

/** Whether the ability stacks in sub slots as ability points (e.g. ISM) as opposed to a main-only ability (e.g. SJ). */
export function isStackableAbility(
	ability: AbilityWithUnknown,
): ability is Ability {
	if (ability === "UNKNOWN") return false;
	const abilityObj = abilities.find((a) => a.name === ability);
	invariant(abilityObj);

	return abilityObj.type === "STACKABLE";
}

/** Whether the ability only exists in the main slot of one gear type (e.g. SJ). */
export function isMainOnlyAbility(
	ability: AbilityWithUnknown,
): ability is Ability {
	if (ability === "UNKNOWN") return false;

	return !isStackableAbility(ability);
}
