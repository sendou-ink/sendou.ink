import * as R from "remeda";
import { abilities } from "~/modules/in-game-lists/abilities";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { Ability, MainWeaponId } from "~/modules/in-game-lists/types";
import { invariant } from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import { MAIN_SLOT_AP } from "../build-analyzer/analyzer-constants";
import type * as BuildRepository from "../builds/BuildRepository.server";
import {
	AP_DISTRIBUTION_BINS,
	PEER_MIN_BUILDS_COUNT,
	PEERS_COUNT,
	POPULAR_BUILDS_MAX_COUNT,
	STAPLES_COUNT,
	VARIETY_TOP_BUILDS_COUNT,
} from "./build-stats-constants";

type AbilityPointSums = Awaited<
	ReturnType<typeof BuildRepository.findAllAbilityPointSums>
>;
type AbilityPointCounts = Awaited<
	ReturnType<typeof BuildRepository.findAbilityPointCountsByWeaponIds>
>;
type NewestBuild = Awaited<
	ReturnType<typeof BuildRepository.findNewestBuildPerOwnerByWeaponId>
>[number];

const MAIN_ONLY_GEAR_TYPE = {
	HEAD_MAIN_ONLY: "HEAD",
	CLOTHES_MAIN_ONLY: "CLOTHES",
	SHOES_MAIN_ONLY: "SHOES",
} as const;

/**
 * Ability stats of the weapon's builds compared to all builds and, per stackable ability, to the other weapons in
 * `weaponAbilityPointCounts` (the weapon itself included there).
 */
export function abilityStats({
	weaponId,
	allAbilityPointSums,
	weaponAbilityPointCounts,
}: {
	weaponId: MainWeaponId;
	allAbilityPointSums: AbilityPointSums;
	weaponAbilityPointCounts: AbilityPointCounts;
}) {
	const buildsCountOf = (id: MainWeaponId) =>
		weaponAbilityPointCounts.buildCounts.find((row) => row.weaponSplId === id)
			?.buildsCount ?? 0;
	const rowsByWeaponAndAbility = R.groupBy(
		weaponAbilityPointCounts.abilityPointCounts,
		(row) => `${row.weaponSplId}-${row.ability}`,
	);
	const rowsOf = (id: MainWeaponId, ability: Ability) =>
		rowsByWeaponAndAbility[`${id}-${ability}`] ?? [];
	const buildsRunning = (
		id: MainWeaponId,
		ability: Ability,
		range: { min: number; max: number } = {
			min: 1,
			max: Number.POSITIVE_INFINITY,
		},
	) =>
		R.sumBy(
			rowsOf(id, ability).filter(
				(row) =>
					row.abilityPoints >= range.min && row.abilityPoints <= range.max,
			),
			(row) => row.buildsCount,
		);
	const apAverageOf = (id: MainWeaponId, ability: Ability) =>
		ratio(
			R.sumBy(
				rowsOf(id, ability),
				(row) => row.abilityPoints * row.buildsCount,
			),
			buildsCountOf(id),
		);
	const allAbilityPointsOf = (ability: Ability) =>
		allAbilityPointSums.abilities.find((row) => row.ability === ability)
			?.abilityPointsSum ?? 0;

	const weaponBuildsCount = buildsCountOf(weaponId);
	const peerWeaponIds = R.unique([
		weaponId,
		...weaponAbilityPointCounts.buildCounts
			.filter((row) => row.buildsCount >= PEER_MIN_BUILDS_COUNT)
			.map((row) => row.weaponSplId),
	]);

	const stackableAbilities = abilities
		.filter((ability) => ability.type === "STACKABLE")
		.map(({ name }) => {
			const buildsWithAbility = buildsRunning(weaponId, name);

			return {
				name,
				apAverage: {
					weapon: apAverageOf(weaponId, name),
					all: ratio(allAbilityPointsOf(name), allAbilityPointSums.buildsCount),
				},
				percentage: percentage(buildsWithAbility, weaponBuildsCount),
				distribution: AP_DISTRIBUTION_BINS.map((bin) => ({
					...bin,
					percentage: percentage(
						bin.min === 0
							? weaponBuildsCount - buildsWithAbility
							: buildsRunning(weaponId, name, bin),
						weaponBuildsCount,
					),
				})),
				peers: peersOf({
					weaponId,
					peers: peerWeaponIds.map((id) => ({
						weaponSplId: id,
						apAverage: apAverageOf(id, name),
					})),
				}),
			};
		})
		.sort((a, b) => b.apAverage.weapon - a.apAverage.weapon);

	const mainOnlyAbilities = abilities
		.flatMap((ability) =>
			ability.type === "STACKABLE"
				? []
				: [
						{
							name: ability.name,
							gearType: MAIN_ONLY_GEAR_TYPE[ability.type],
							percentage: {
								weapon: percentage(
									buildsRunning(weaponId, ability.name),
									weaponBuildsCount,
								),
								// main-only abilities always take the place of a main slot
								all: percentage(
									allAbilityPointsOf(ability.name) / MAIN_SLOT_AP,
									allAbilityPointSums.buildsCount,
								),
							},
						},
					],
		)
		.sort((a, b) => b.percentage.weapon - a.percentage.weapon);

	return {
		weaponBuildsCount,
		stackableAbilities,
		mainOnlyAbilities,
	};
}

/**
 * The most popular ability combinations (by ability points, so the gear they're on doesn't matter) among the builds,
 * expected to be each player's newest one, plus how varied the builds are. Builds with only one ability are left out
 * as they are typically for testing.
 */
export function popularBuilds(allBuilds: Array<NewestBuild>) {
	const builds = allBuilds.filter((build) => !isSingleAbilityBuild(build));
	const sortedGroups = Object.entries(
		R.groupBy(builds, (build) => build.abilitiesSignature),
	).sort(
		([signatureA, groupA], [signatureB, groupB]) =>
			groupB.length - groupA.length || signatureA.localeCompare(signatureB),
	);
	const popularGroups = sortedGroups
		.filter(([, group]) => group.length > 1)
		.slice(0, POPULAR_BUILDS_MAX_COUNT);

	const popular = popularGroups.map(([signature, group]) => ({
		id: signature,
		rank:
			popularGroups.findIndex(([, other]) => other.length === group.length) + 1,
		playersCount: group.length,
		playersPercentage: percentage(group.length, builds.length),
		abilities: mostCommonLayout(group),
		modes: frequentModes(group),
		abilityPoints: parseSignature(signature),
	}));
	const topGroups = sortedGroups.slice(0, VARIETY_TOP_BUILDS_COUNT);

	return {
		builds: popular,
		staples: staples(popular),
		playersCount: builds.length,
		uniqueBuildsCount: sortedGroups.length,
		topBuildsCount: topGroups.length,
		topBuildsPercentage: percentage(
			R.sumBy(topGroups, ([, group]) => group.length),
			builds.length,
		),
	};
}

function isSingleAbilityBuild(build: NewestBuild) {
	return !build.abilitiesSignature.includes(",");
}

function ratio(part: number, whole: number) {
	if (whole === 0) return 0;

	return roundToNDecimalPlaces(part / whole, 1);
}

function percentage(part: number, whole: number) {
	return ratio(part * 100, whole);
}

function peersOf<T extends { weaponSplId: MainWeaponId; apAverage: number }>({
	weaponId,
	peers,
}: {
	weaponId: MainWeaponId;
	peers: T[];
}) {
	const sorted = peers.slice().sort((a, b) => b.apAverage - a.apAverage);
	const shown = sorted.slice(0, PEERS_COUNT);
	if (shown.some((peer) => peer.weaponSplId === weaponId)) return shown;

	const weapon = sorted.find((peer) => peer.weaponSplId === weaponId);
	invariant(weapon, "weapon missing from its peers");

	return [...shown, weapon];
}

function mostCommonLayout(builds: [NewestBuild, ...NewestBuild[]]) {
	const layoutKey = (build: NewestBuild) => JSON.stringify(build.abilities);
	const layoutCounts = R.countBy(builds, layoutKey);

	return R.firstBy(builds, [(build) => layoutCounts[layoutKey(build)], "desc"])
		.abilities;
}

/** Modes more than half of the builds are marked for. */
function frequentModes(builds: NewestBuild[]) {
	return modesShort.filter(
		(mode) =>
			builds.filter((build) => build.modes?.includes(mode)).length * 2 >
			builds.length,
	);
}

function parseSignature(signature: string) {
	return signature.split(",").map((serializedAbility) => {
		const [ability, abilityPoints] = serializedAbility.split("_");
		invariant(ability, "ability is not defined");
		invariant(abilityPoints, "ability points are not defined");

		return {
			ability: ability as Ability,
			abilityPoints: Number(abilityPoints),
		};
	});
}

/** How many of the popular builds run each ability, the most common first. */
function staples(
	popular: Array<{ abilityPoints: Array<{ ability: Ability }> }>,
) {
	const counts = new Map<Ability, number>();
	for (const build of popular) {
		for (const { ability } of build.abilityPoints) {
			counts.set(ability, (counts.get(ability) ?? 0) + 1);
		}
	}

	return [...counts]
		.map(([ability, buildsCount]) => ({ ability, buildsCount }))
		.sort((a, b) => b.buildsCount - a.buildsCount)
		.slice(0, STAPLES_COUNT);
}
