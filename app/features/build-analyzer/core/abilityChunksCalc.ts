import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	AbilityWithUnknown,
	BuildAbilitiesTupleWithUnknown,
} from "~/modules/in-game-lists/types";
import type { AbilityChunks } from "../analyzer-types";

// Reference for Ability Chunks numbers: https://splatoonwiki.org/wiki/Ability_chunk#Splatoon_3
const MAIN_REQUIRED_ABILITY_CHUNKS_COUNT = 45;
const PRIMARY_SLOT_ONLY_REQUIRED_ABILITY_CHUNKS_COUNT = 15;
const SUB_REQUIRED_ABILITY_CHUNKS_COUNT = 10;

// Ability Doubler: a non-duplicate secondary ability costs 3 chunks, https://splatoonwiki.org/wiki/Splatfest_Tee#Splatoon_3_2
const SUB_WITH_ABILITY_DOUBLER_REQUIRED_ABILITY_CHUNKS_COUNT = 3;

export const ABILITIES_WITHOUT_CHUNKS = new Set(["UNKNOWN", "AD"]);

/** Chunks required for the build, as [ability, count] sorted by count descending. */
export function getAbilityChunksMapAsArray(
	build: BuildAbilitiesTupleWithUnknown,
) {
	const abilityChunksMap: AbilityChunks = new Map<AbilityWithUnknown, number>();
	updateAbilityChunksMap(abilityChunksMap, build);

	return Array.from(abilityChunksMap).sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
}

function updateAbilityChunksMap(
	abilityChunksMap: AbilityChunks,
	build: BuildAbilitiesTupleWithUnknown,
) {
	let buildIndex = 0;

	for (const gear of build) {
		let hasAbilityDoubler = false;

		// chunk cost of the same ability escalates within one piece of gear
		const abilityChunksMapForGear = new Map<AbilityWithUnknown, number>();

		for (const [index, selectedAbility] of gear.entries()) {
			if (!selectedAbility) continue;
			if (ABILITIES_WITHOUT_CHUNKS.has(selectedAbility)) {
				if (selectedAbility === "AD" && buildIndex === 1) {
					hasAbilityDoubler = true;
				}
				continue;
			}

			if (index === 0) {
				const primarySlotOnlyAbilityRef = abilities.filter(
					(a) =>
						a.name === selectedAbility &&
						a.abilityChunkTypesRequired.length > 0,
				);

				// primary slot-only abilities are made of 3 stackable chunks at a lower count than usual
				if (primarySlotOnlyAbilityRef.length === 1) {
					const primaryAbility = primarySlotOnlyAbilityRef[0];
					if (!primaryAbility) continue;

					for (const ability of primaryAbility.abilityChunkTypesRequired) {
						abilityChunksMap.set(
							ability,
							(abilityChunksMap.get(ability) ?? 0) +
								PRIMARY_SLOT_ONLY_REQUIRED_ABILITY_CHUNKS_COUNT,
						);
					}
				} else {
					abilityChunksMap.set(
						selectedAbility,
						(abilityChunksMap.get(selectedAbility) ?? 0) +
							MAIN_REQUIRED_ABILITY_CHUNKS_COUNT,
					);
				}
			} else {
				// 10/20/30 chunks for 1/2/3 of the same sub ability, 3/6/9 with Ability Doubler
				abilityChunksMapForGear.set(
					selectedAbility,
					(abilityChunksMapForGear.get(selectedAbility) ?? 0) +
						(hasAbilityDoubler
							? SUB_WITH_ABILITY_DOUBLER_REQUIRED_ABILITY_CHUNKS_COUNT
							: SUB_REQUIRED_ABILITY_CHUNKS_COUNT),
				);

				abilityChunksMap.set(
					selectedAbility,
					(abilityChunksMap.get(selectedAbility) ?? 0) +
						(abilityChunksMapForGear.get(selectedAbility) ?? 0),
				);
			}
		}

		buildIndex += 1;
	}
}
