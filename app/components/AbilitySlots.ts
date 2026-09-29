import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	Ability,
	AbilityType,
	BuildAbilitiesTupleWithUnknown,
} from "~/modules/in-game-lists/types";

export interface Slot {
	rowI: number;
	abilityI: number;
}

const MAIN_ONLY_TYPE_BY_ROW: AbilityType[] = [
	"HEAD_MAIN_ONLY",
	"CLOTHES_MAIN_ONLY",
	"SHOES_MAIN_ONLY",
];

/** Whether the ability is legal in the slot, ignoring what currently occupies it. */
export function canPlaceAt(ability: Ability, slot: Slot) {
	const type = abilityType(ability);

	if (slot.abilityI !== 0) return type === "STACKABLE";

	return type === "STACKABLE" || type === MAIN_ONLY_TYPE_BY_ROW[slot.rowI];
}

/** First empty slot the ability is legal in, or null if there is none. */
export function firstEmptyValidSlot(
	build: BuildAbilitiesTupleWithUnknown,
	ability: Ability,
): Slot | null {
	for (const [rowI, row] of build.entries()) {
		for (const [abilityI, current] of row.entries()) {
			if (current !== "UNKNOWN") continue;

			const slot = { rowI, abilityI };
			if (canPlaceAt(ability, slot)) return slot;
		}
	}

	return null;
}

/** Places the ability in the first empty slot it is legal in, unchanged if there is none. */
export function add(
	build: BuildAbilitiesTupleWithUnknown,
	ability: Ability,
): BuildAbilitiesTupleWithUnknown {
	const slot = firstEmptyValidSlot(build, ability);
	if (!slot) return build;

	return withSlot(build, slot, ability);
}

/** Places the ability in the slot replacing what was there, unchanged if it is not legal there. */
export function placeAt(
	build: BuildAbilitiesTupleWithUnknown,
	ability: Ability,
	slot: Slot,
): BuildAbilitiesTupleWithUnknown {
	if (!canPlaceAt(ability, slot)) return build;

	return withSlot(build, slot, ability);
}

/** Empties the slot. */
export function remove(
	build: BuildAbilitiesTupleWithUnknown,
	slot: Slot,
): BuildAbilitiesTupleWithUnknown {
	return withSlot(build, slot, "UNKNOWN");
}

/** Whether the ability in `from` can be moved to `to`, swapping with whatever `to` holds. */
export function canMove(
	build: BuildAbilitiesTupleWithUnknown,
	from: Slot,
	to: Slot,
) {
	const moving = abilityAt(build, from);
	const displaced = abilityAt(build, to);
	if (moving === "UNKNOWN") return false;

	return (
		canPlaceAt(moving, to) &&
		(displaced === "UNKNOWN" || canPlaceAt(displaced, from))
	);
}

/** Moves the ability in `from` to `to` swapping the two, unchanged if not allowed. */
export function move(
	build: BuildAbilitiesTupleWithUnknown,
	from: Slot,
	to: Slot,
): BuildAbilitiesTupleWithUnknown {
	if (!canMove(build, from, to)) return build;

	return withSlot(
		withSlot(build, to, abilityAt(build, from)),
		from,
		abilityAt(build, to),
	);
}

function abilityType(ability: Ability) {
	const found = abilities.find((a) => a.name === ability);
	if (!found) throw new Error(`Unknown ability: ${ability}`);

	return found.type;
}

function abilityAt(build: BuildAbilitiesTupleWithUnknown, slot: Slot) {
	return build[slot.rowI][slot.abilityI];
}

function withSlot(
	build: BuildAbilitiesTupleWithUnknown,
	slot: Slot,
	ability: BuildAbilitiesTupleWithUnknown[number][number],
): BuildAbilitiesTupleWithUnknown {
	const result = structuredClone(build);
	result[slot.rowI][slot.abilityI] = ability;

	return result;
}
