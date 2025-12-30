import { z } from "zod";
import { SENDOUQ, SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import {
	_action,
	checkboxValueToBoolean,
	falsyToNull,
	id,
	safeJSONParse,
	weaponSplId,
} from "~/utils/zod";
import { matchEndedAtIndex } from "./core/match";

const winners = z.preprocess(
	safeJSONParse,
	z
		.array(z.enum(["ALPHA", "BRAVO"]))
		.max(SENDOUQ_BEST_OF)
		.refine((val) => {
			if (val.length === 0) return true;

			const matchEndedAt = matchEndedAtIndex(val);

			// match did end
			if (matchEndedAt === null) return true;

			// no extra scores after match ended
			return val.length === matchEndedAt + 1;
		}),
);

const weapons = z.preprocess(
	safeJSONParse,
	z
		.array(
			z.object({
				weaponSplId,
				userId: id,
				mapIndex: z.number().int().nonnegative(),
				groupMatchMapId: id,
			}),
		)
		.nullish()
		.default([]),
);
export const matchSchema = z.union([
	z.object({
		_action: _action("REPORT_SCORE"),
		winners,
		weapons,
		adminReport: z.preprocess(
			checkboxValueToBoolean,
			z.boolean().nullish().default(false),
		),
	}),
	z.object({
		_action: _action("LOOK_AGAIN"),
		previousGroupId: id,
	}),
	z.object({
		_action: _action("REPORT_WEAPONS"),
		weapons,
	}),
	z.object({
		_action: _action("ADD_PRIVATE_USER_NOTE"),
		comment: z.preprocess(
			falsyToNull,
			z.string().max(SENDOUQ.PRIVATE_USER_NOTE_MAX_LENGTH).nullable(),
		),
		sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
		targetId: id,
	}),
]);

export const qMatchPageParamsSchema = z.object({
	id,
});
