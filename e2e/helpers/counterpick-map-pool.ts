import type { Page } from "@playwright/test";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";

/** Stage the counterpick picking starts from. */
const FIRST_COUNTERPICK_STAGE_ID = 5;

/** A stage of a `ModeMapPoolPicker`, whether picked or not. */
export function counterpickMap(page: Page, mode: ModeShort, stageId: StageId) {
	return page.getByTestId(`map-pool-${mode}-${stageId}`);
}

/** The check overlaying a picked stage. It covers the stage itself, so unpicking goes through it. */
export function pickedCounterpickMap(
	page: Page,
	mode: ModeShort,
	stageId: StageId,
) {
	return page.getByTestId(`map-pool-${mode}-${stageId}-picked`);
}

/** Picks the default amount of counterpick maps for every ranked mode, skipping banned ones, and returns them. */
export async function pickCounterpickMaps(page: Page) {
	const picked: Array<{ mode: ModeShort; stageId: StageId }> = [];
	let stageId = FIRST_COUNTERPICK_STAGE_ID;

	for (const { mode, count } of TeamPick.defaultSettings([...rankedModesShort])
		.modes) {
		for (let i = 0; i < count; i++) {
			while (BANNED_MAPS[mode].includes(stageId as StageId)) {
				stageId++;
			}

			await counterpickMap(page, mode, stageId as StageId).click();
			picked.push({ mode, stageId: stageId as StageId });
			stageId++;
		}
	}

	return picked;
}
