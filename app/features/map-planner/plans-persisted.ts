import * as v from "valibot";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { numericEnum } from "~/utils/schema";

/** Plans handed from another tab to the planner, keyed by `<stashed at ms>-<random>`, see `PlanImport` */
export const importedPlansPersisted = PersistedState.defineMap({
	keyPrefix: "plans-import:",
	storage: "local",
	schema: v.nullable(
		v.object({
			/** the canvas background, as a data URL so the saved plan outlives the page */
			background: v.string(),
			/** main weapons placed beside the background */
			allies: v.array(numericEnum(mainWeaponIds)),
			/** main weapons placed beside the background, outlined */
			enemies: v.array(numericEnum(mainWeaponIds)),
		}),
	),
	default: null,
});
