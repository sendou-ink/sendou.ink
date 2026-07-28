import { abilities } from "~/modules/in-game-lists/abilities";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type {
	Ability,
	BuildAbilitiesTuple,
	ModeWithStage,
} from "~/modules/in-game-lists/types";
import { faker } from "./faker";

const STACKABLE_ABILITIES = abilities
	.filter((ability) => ability.type === "STACKABLE")
	.map((ability) => ability.name);

/**
 * A map list of `count` maps, rotating through the ranked modes and never repeating
 * a stage, the way a real one looks. Callers add whatever `source` their domain uses.
 */
export function mapList(count: number): ModeWithStage[] {
	const stages = faker.helpers.arrayElements(stageIds, count);

	return stages.map((stageId, i) => ({
		mode: rankedModesShort[i % rankedModesShort.length],
		stageId,
	}));
}

/**
 * The abilities of a build: a main and three subs per gear slot. All of them are
 * stackable ones, which every slot allows.
 */
export function buildAbilities(): BuildAbilitiesTuple {
	return [gearAbilities(), gearAbilities(), gearAbilities()];
}

function gearAbilities(): [Ability, Ability, Ability, Ability] {
	const draw = () => faker.helpers.arrayElement(STACKABLE_ABILITIES);

	return [draw(), draw(), draw(), draw()];
}
