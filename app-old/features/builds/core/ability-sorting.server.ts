import {
	type Ability,
	type BuildAbilitiesTuple,
	abilities,
} from "~/modules/in-game-lists";
import { mainOnlyAbilitiesShort } from "~/modules/in-game-lists/abilities";

const abilityToIndex = abilities.reduce(
	(acc, ability, index) => {
		acc[ability.name] = index;
		return acc;
	},
	{} as Record<Ability, number>,
);

const mainOnlyAbilitiesSet = new Set(mainOnlyAbilitiesShort);

const abilitySorter = (a: Ability, b: Ability) =>
	abilityToIndex[a] - abilityToIndex[b];

export function sortAbilities(
	abilities: BuildAbilitiesTuple,
): BuildAbilitiesTuple {
	const m1 = abilities[0][0];
	const m2 = abilities[1][0];
	const m3 = abilities[2][0];
	const oldMainAbilities = [abilities[0][0], abilities[1][0], abilities[2][0]];

	const sortedMainAbilities = [m1, m2, m3]
		.filter((ability) => !mainOnlyAbilitiesSet.has(ability as any))
		.sort(abilitySorter);
	const newMainAbilities = oldMainAbilities.map((ability) =>
		mainOnlyAbilitiesSet.has(ability as any)
			? ability
			: sortedMainAbilities.pop(),
	);

	const subAbilities = subAbilitiesSorted(abilities);

	return switchSubRowsIfBetter([
		[newMainAbilities[0], ...subAbilities.slice(0, 3)],
		[newMainAbilities[1], ...subAbilities.slice(3, 6)],
		[newMainAbilities[2], ...subAbilities.slice(6, 9)],
	] as BuildAbilitiesTuple);
}

const sortAbilityCount = (a: [Ability, number], b: [Ability, number]) => {
	if (a[1] === b[1]) {
		return abilitySorter(a[0], b[0]);
	}

	return b[1] - a[1];
};
function subAbilitiesSorted(abilities: BuildAbilitiesTuple): Ability[] {
	const subAbilitiesUnsorted = [
		abilities[0].slice(1),
		abilities[1].slice(1),
		abilities[2].slice(1),
	].flat();

	const counts = Array.from(
		subAbilitiesUnsorted
			.reduce((acc, cur) => {
				if (!acc.has(cur)) {
					acc.set(cur, 1);
				} else {
					acc.set(cur, acc.get(cur)! + 1);
				}
				return acc;
			}, new Map<Ability, number>())
			.entries(),
	).sort(sortAbilityCount);

	const subAbilities: Ability[][] = [[], [], []];
	while (counts.length > 0) {
		const [ability, count] = counts[0];
		if (count >= 3) {
			for (const row of subAbilities) {
				if (row.length === 0) {
					row.push(ability, ability, ability);
					counts[0][1] -= 3;
					break;
				}
			}
		} else if (count === 2) {
			let found = false;
			for (const row of subAbilities) {
				if (row.length === 0) {
					row.push(ability, ability);
					counts[0][1] -= 2;
					found = true;
					break;
				}
			}

			if (!found) {
				// treat them as singles
				counts.push([ability, 1]);
				counts.push([ability, 1]);
				counts.shift();
			}
		} else {
			let found = false;
			for (const row of subAbilities) {
				if (row.length < 3) {
					row.push(ability);
					counts[0][1] -= 1;
					found = true;
					break;
				}
			}
			if (!found) {
				throw new Error("Absurd state in ability sorting");
			}
		}

		if (counts[0][1] === 0) {
			counts.shift();
		}

		counts.sort(sortAbilityCount);
	}

	return subAbilities.flat();
}

function switchSubRowsIfBetter(
	abilities: BuildAbilitiesTuple,
): BuildAbilitiesTuple {
	const desiredMoves: [source: number, target: number][] = [];

	for (const [i, row] of abilities.entries()) {
		const [m, s1] = row;

		// already in a good place
		if (m === s1) continue;

		for (const [j, row2] of abilities.entries()) {
			if (i === j) continue;

			const [m2, s21] = row2;

			// already a nice row
			if (m2 === s21) {
				continue;
			}

			if (m2 === s1 && !desiredMoves.some(([, target]) => target === j)) {
				desiredMoves.push([i, j]);
				break;
			}
		}
	}

	for (const [source, target] of desiredMoves) {
		const temp = abilities[source].slice(1);
		abilities[source].splice(1, 3, ...abilities[target].slice(1));
		abilities[target].splice(1, 3, ...temp);
	}

	return abilities;
}
