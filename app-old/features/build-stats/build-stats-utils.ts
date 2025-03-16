import { MAX_AP } from "~/constants";
import { type Ability, abilities } from "~/modules/in-game-lists";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import { isStackableAbility } from "../build-analyzer/core/utils";
import type { AbilitiesByWeapon } from "./queries/abilitiesByWeaponId.server";
import type { AverageAbilityPointsResult } from "./queries/averageAbilityPoints.server";

const toBuildsCount = (counts: AverageAbilityPointsResult[]) =>
	counts.reduce((acc, cur) => acc + cur.abilityPointsSum, 0) / MAX_AP;

const toAbilityPoints = (
	abilities: AverageAbilityPointsResult[],
	ability: Ability,
) =>
	abilities.find((current) => current.ability === ability)?.abilityPointsSum ??
	0;

export function abilityPointCountsToAverages({
	allAbilities,
	weaponAbilities,
}: {
	allAbilities: AverageAbilityPointsResult[];
	weaponAbilities: AverageAbilityPointsResult[];
}) {
	const allBuildsCount = toBuildsCount(allAbilities);
	const weaponBuildsCount = toBuildsCount(weaponAbilities);
	invariant(
		allBuildsCount > weaponBuildsCount,
		"allBuildsCount < weaponBuildsCount",
	);

	const mainOnlyAbilities = abilities
		.filter((ability) => ability.type !== "STACKABLE")
		.map((ability) => {
			const allBuildsAbilityPoints = toAbilityPoints(
				allAbilities,
				ability.name,
			);
			const weaponBuildsAbilityPoints = toAbilityPoints(
				weaponAbilities,
				ability.name,
			);

			// main only abilities always take place of 10AP
			const allBuildsWithTheAbility = allBuildsAbilityPoints / 10;
			const weaponBuildsWithTheAbility = weaponBuildsAbilityPoints / 10;

			return {
				name: ability.name,
				percentage: {
					all: roundToNDecimalPlaces(
						(allBuildsWithTheAbility / allBuildsCount) * 100,
					),
					weapon: roundToNDecimalPlaces(
						(weaponBuildsWithTheAbility / weaponBuildsCount) * 100,
					),
				},
			};
		})
		.sort((a, b) => b.percentage.weapon - a.percentage.weapon);

	const stackableAbilities = abilities
		.filter((ability) => ability.type === "STACKABLE")
		.map((ability) => {
			const allBuildsAbilityPoints = toAbilityPoints(
				allAbilities,
				ability.name,
			);
			const weaponBuildsAbilityPoints = toAbilityPoints(
				weaponAbilities,
				ability.name,
			);

			return {
				name: ability.name,
				apAverage: {
					all: roundToNDecimalPlaces(allBuildsAbilityPoints / allBuildsCount),
					weapon: roundToNDecimalPlaces(
						weaponBuildsAbilityPoints / weaponBuildsCount,
					),
				},
			};
		})
		.sort((a, b) => b.apAverage.weapon - a.apAverage.weapon);

	return {
		mainOnlyAbilities,
		stackableAbilities,
		weaponBuildsCount,
	};
}

// ---

type AbilityCountsMap = Map<Ability, number>;

const POPULAR_BUILDS_TO_SHOW = 25;

export function popularBuilds(builds: Array<AbilitiesByWeapon>) {
	const counts = new Map<string, number>();
	for (const build of builds) {
		const summedUpAbilities = sumUpAbilities(build);
		const serializedAbilities = serializeAbilityCountsMap(summedUpAbilities);

		counts.set(serializedAbilities, (counts.get(serializedAbilities) ?? 0) + 1);
	}

	const serializedToShow = Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.filter(([, count]) => count > 1)
		.slice(0, POPULAR_BUILDS_TO_SHOW);

	return serializedToShowToResultType(serializedToShow);
}

function sumUpAbilities(build: AbilitiesByWeapon) {
	const result: AbilityCountsMap = new Map();
	for (const { ability, abilityPoints } of build.abilities) {
		result.set(ability, (result.get(ability) ?? 0) + abilityPoints);
	}

	return result;
}

function serializeAbilityCountsMap(abilityCountsMap: AbilityCountsMap) {
	return Array.from(abilityCountsMap.entries())
		.sort((a, b) => {
			if (a[1] === b[1]) {
				return a[0].localeCompare(b[0]);
			}

			return b[1] - a[1];
		})
		.map(([ability, count]) => `${ability}_${count}`)
		.join(",");
}

function serializedToShowToResultType(serializedToShow: [string, number][]) {
	let previousCount: number;
	return serializedToShow.map(([serialized, count]) => {
		const abilities = serialized.split(",").map((serializedAbility) => {
			const [ability, count] = serializedAbility.split("_");
			invariant(ability, "ability is not defined");
			invariant(count, "count is not defined");
			return {
				ability: ability as Ability,
				count: isStackableAbility(ability as Ability)
					? Number(count)
					: undefined,
			};
		});

		if (previousCount === count) {
			return { abilities, count: null, id: serialized };
		}

		previousCount = count;
		return { abilities, count, id: serialized };
	});
}
