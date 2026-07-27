import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeWithStage } from "~/modules/in-game-lists/types";
import { faker } from "./faker";

/** A random mode, turf war included. */
export function mode() {
	return faker.helpers.arrayElement(modesShort);
}

/** A random ranked mode. */
export function rankedMode() {
	return faker.helpers.arrayElement(rankedModesShort);
}

/** A random stage. */
export function stageId() {
	return faker.helpers.arrayElement(stageIds);
}

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
