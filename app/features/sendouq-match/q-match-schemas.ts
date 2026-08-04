import { z } from "zod";
import { checkboxGroupDynamic, stringConstant, textArea } from "~/form/fields";
import { _action, id, weaponSplId } from "~/utils/zod";
import { SENDOUQ } from "../sendouq/q-constants";

const cancelNominatedUserIdsField = checkboxGroupDynamic({
	label: "labels.cancelNominatedPlayers",
	bottomText: "bottomTexts.cancelNominatedPlayers",
	minLength: 1,
});

const cancelReasonField = textArea({
	label: "labels.reason",
	maxLength: SENDOUQ.CANCEL_REASON_MAX_LENGTH,
});

export const requestCancelSchema = z.object({
	_action: stringConstant("REQUEST_CANCEL"),
	nominatedUserIds: cancelNominatedUserIdsField,
	reason: cancelReasonField,
});

export const acceptCancelSchema = z.object({
	_action: stringConstant("ACCEPT_CANCEL"),
	nominatedUserIds: cancelNominatedUserIdsField,
	reason: cancelReasonField,
});

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
		isContinuing: z.enum(["0", "1"]).transform((v) => v === "1"),
	}),
	z.object({
		_action: _action("REPORT_WEAPON"),
		weaponSplId,
		mapIndex: z.coerce.number().int().nonnegative(),
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
	requestCancelSchema,
	acceptCancelSchema,
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
