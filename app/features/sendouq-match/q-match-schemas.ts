import { z } from "zod";
import { SENDOUQ } from "~/features/sendouq/q-constants";
import { _action, falsyToNull, id, weaponSplId } from "~/utils/zod";

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
		_action: _action("CAST_CONTINUE_VOTE"),
		isContinuing: z.enum(["0", "1"]).transform((v) => Number(v) as 0 | 1),
	}),
	z.object({
		_action: _action("REPORT_WEAPON"),
		weaponSplId,
		groupMatchMapId: id,
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
		mapIndex: z.coerce.number().int().nonnegative(),
	}),
	z.object({
		_action: _action("UNDO_WEAPON_REPORT"),
		mapIndex: z.coerce.number().int().nonnegative(),
	}),
	z.object({
		_action: _action("REQUEST_CANCEL"),
	}),
	z.object({
		_action: _action("ACCEPT_CANCEL"),
	}),
	z.object({
		_action: _action("REFUSE_CANCEL"),
	}),
	z.object({
		_action: _action("ADMIN_CANCEL"),
	}),
]);

export const qMatchPageParamsSchema = z.object({
	id,
});
