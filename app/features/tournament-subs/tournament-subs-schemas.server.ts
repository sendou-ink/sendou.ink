import { z } from "zod";
import { mainWeaponIds } from "~/modules/in-game-lists";
import { id, processMany, removeDuplicates, safeJSONParse } from "~/utils/zod";
import { TOURNAMENT_SUB } from "./tournament-subs-constants";

export const subSchema = z.object({
	canVc: z.coerce.number().int().min(0).max(2),
	bestWeapons: z.preprocess(
		processMany(safeJSONParse, removeDuplicates),
		z
			.array(
				z
					.number()
					.refine((val) =>
						mainWeaponIds.includes(val as (typeof mainWeaponIds)[number]),
					),
			)
			.min(1)
			.max(TOURNAMENT_SUB.WEAPON_POOL_MAX_SIZE),
	),
	okWeapons: z.preprocess(
		processMany(safeJSONParse, removeDuplicates),
		z
			.array(
				z
					.number()
					.refine((val) =>
						mainWeaponIds.includes(val as (typeof mainWeaponIds)[number]),
					),
			)
			.max(TOURNAMENT_SUB.WEAPON_POOL_MAX_SIZE),
	),
	message: z.string().max(TOURNAMENT_SUB.MESSAGE_MAX_LENGTH).nullish(),
	visibility: z.enum(["+1", "+2", "+3", "ALL"]).default("ALL"),
});

export const deleteSubSchema = z.object({
	userId: id,
});
