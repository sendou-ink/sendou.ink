import { z } from "zod";
import { languagesUnified } from "~/modules/i18n/config";
import {
	_action,
	checkboxValueToBoolean,
	id,
	modeShort,
	noDuplicates,
	safeJSONParse,
	stageId,
} from "~/utils/zod";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "./q-settings-constants";
import { updateWeaponPoolSchema } from "./q-settings-schemas";

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
	z.object({
		_action: _action("UPDATE_VC"),
		vc: z.enum(["YES", "NO", "LISTEN_ONLY"]),
		languages: z.preprocess(
			safeJSONParse,
			z
				.array(z.string())
				.refine(noDuplicates)
				.refine((val) =>
					val.every((lang) => languagesUnified.some((l) => l.code === lang)),
				),
		),
	}),
	updateWeaponPoolSchema,
	z.object({
		_action: _action("UPDATE_NO_SCREEN"),
		noScreen: z.preprocess(checkboxValueToBoolean, z.boolean()),
	}),
	z.object({
		_action: _action("REMOVE_TRUST"),
		userToRemoveTrustFromId: id,
	}),
]);
