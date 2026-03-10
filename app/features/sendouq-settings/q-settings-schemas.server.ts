import { z } from "zod";
import { _action, id, modeShort, safeJSONParse, stageId } from "~/utils/zod";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "./q-settings-constants";
import {
	updateVoiceChatSchema,
	updateWeaponPoolSchema,
} from "./q-settings-schemas";

const preference = z.enum(["AVOID", "PREFER"]).optional();
export const settingsActionSchema = z.union([
	z.object({
		_action: _action("UPDATE_MAP_MODE_PREFERENCES"),
		mapModePreferences: z.preprocess(
			safeJSONParse,
			z
				.object({
					modes: z.array(z.object({ mode: modeShort, preference })),
					pool: z.array(
						z.object({
							stages: z.array(stageId).max(AMOUNT_OF_MAPS_IN_POOL_PER_MODE),
							mode: modeShort,
						}),
					),
				})
				.refine(
					(val) =>
						val.pool.every((pool) => {
							const mp = val.modes.find((m) => m.mode === pool.mode);
							return mp?.preference !== "AVOID";
						}),
					"Can't have map pool for a mode that was avoided",
				),
		),
	}),
	updateVoiceChatSchema,
	updateWeaponPoolSchema,
	z.object({
		_action: _action("REMOVE_TRUST"),
		userToRemoveTrustFromId: id,
	}),
]);
