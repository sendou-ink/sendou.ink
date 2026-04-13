import { z } from "zod";
import { SENDOUQ } from "~/features/sendouq/q-constants";
import {
	_action,
	falsyToNull,
	id,
	safeJSONParse,
	weaponSplId,
} from "~/utils/zod";

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
		.optional()
		.default([]),
);
export const matchSchema = z.union([
	z.object({
		_action: _action("REPORT_SCORE"),
		winnerId: id,
		reportedCount: z.coerce.number().int().nonnegative(),
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
	z.object({
		_action: _action("CONFIRM_ROOM"),
	}),
	z.object({
		_action: _action("UNDO_MATCH_REPORT"),
	}),
	z.object({
		_action: _action("UNDO_MAP_REPORT"),
	}),
]);

export const qMatchPageParamsSchema = z.object({
	id,
});
