import { abilities } from "~/modules/in-game-lists/abilities";
import type { Ability } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import { MAX_AP } from "../build-analyzer/analyzer-constants";
import { isStackableAbility } from "../build-analyzer/core/utils";
import type {
	AverageAbilityPointsResult,
	PopularBuildsRow,
} from "../builds/BuildRepository.server";

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

export function popularBuilds(rows: Array<PopularBuildsRow>) {
	let previousCount: number;
	return rows.map(({ abilitiesSignature, count }) => {
		const abilities = abilitiesSignature.split(",").map((serializedAbility) => {
			const [ability, points] = serializedAbility.split("_");
			invariant(ability, "ability is not defined");
			invariant(points, "count is not defined");
			return {
				ability: ability as Ability,
				count: isStackableAbility(ability as Ability)
					? Number(points)
					: undefined,
			};
		});

		const displayCount = previousCount === count ? null : count;
		previousCount = count;
		return { abilities, count: displayCount, id: abilitiesSignature };
	});
}
