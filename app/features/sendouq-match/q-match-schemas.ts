import * as v from "valibot";
import {
	reportWeaponSchema,
	undoWeaponReportSchema,
} from "~/components/match-page/match-page-schemas";
import { checkboxGroupDynamic, stringConstant, textArea } from "~/form/fields";
import { _action, coerceNumber, id, preprocess } from "~/utils/schema";
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

export const requestCancelSchema = v.object({
	_action: stringConstant("REQUEST_CANCEL"),
	nominatedUserIds: cancelNominatedUserIdsField,
	reason: cancelReasonField,
});

export const acceptCancelSchema = v.object({
	_action: stringConstant("ACCEPT_CANCEL"),
	nominatedUserIds: cancelNominatedUserIdsField,
	reason: cancelReasonField,
});

export const matchSchema = v.union([
	v.object({
		_action: _action("REPORT_SCORE"),
		winnerId: id,
		reportedCount: v.pipe(coerceNumber(), v.integer(), v.minValue(0)),
	}),
	v.object({
		_action: _action("LOOK_AGAIN"),
		previousGroupId: id,
	}),
	v.object({
		_action: _action("CAST_CONTINUE_VOTE"),
		isContinuing: preprocess(
			(value) =>
				value === "1" || value === "true"
					? true
					: value === "0" || value === "false"
						? false
						: value,
			v.boolean(),
		),
	}),
	reportWeaponSchema,
	v.object({
		_action: _action("UNDO_MATCH_REPORT"),
	}),
	v.object({
		_action: _action("UNDO_MAP_REPORT"),
		mapIndex: v.pipe(coerceNumber(), v.integer(), v.minValue(0)),
	}),
	undoWeaponReportSchema,
	requestCancelSchema,
	acceptCancelSchema,
	v.object({
		_action: _action("REFUSE_CANCEL"),
	}),
	v.object({
		_action: _action("ADMIN_CANCEL"),
	}),
]);

export const qMatchPageParamsSchema = v.object({
	id,
});
