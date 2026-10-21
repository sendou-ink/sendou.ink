import { sub } from "date-fns";
import * as v from "valibot";
import { customField, textField } from "~/form/fields";
import { _action, date, id, inviteCode, preprocess } from "~/utils/schema";
import { ASSOCIATION } from "./associations-constants";

export const createNewAssociationSchema = v.object({
	name: textField({
		label: "labels.name",
		maxLength: 100,
	}),
});

const removeMemberSchema = v.object({
	_action: _action("REMOVE_MEMBER"),
	associationId: id,
	userId: id,
});

const addManagerSchema = v.object({
	_action: _action("ADD_MANAGER"),
	associationId: id,
	userId: id,
});

const removeManagerSchema = v.object({
	_action: _action("REMOVE_MANAGER"),
	associationId: id,
	userId: id,
});

const deleteAssociationSchema = v.object({
	_action: _action("DELETE_ASSOCIATION"),
	associationId: id,
});

const refreshInviteCodeSchema = v.object({
	_action: _action("REFRESH_INVITE_CODE"),
	associationId: id,
});

const joinAssociationSchema = v.object({
	_action: _action("JOIN_ASSOCIATION"),
	inviteCode,
});

const leaveAssociationSchema = v.object({
	_action: _action("LEAVE_ASSOCIATION"),
	associationId: id,
});

export const associationsPageActionSchema = v.union([
	removeMemberSchema,
	addManagerSchema,
	removeManagerSchema,
	deleteAssociationSchema,
	refreshInviteCodeSchema,
	joinAssociationSchema,
	leaveAssociationSchema,
]);

const virtualAssociationIdentifierSchema = v.picklist(
	ASSOCIATION.VIRTUAL_IDENTIFIERS,
);

const associationIdentifierSchema = v.union([
	virtualAssociationIdentifierSchema,
	id,
	v.literal("PUBLIC"),
]);

/** Who sees the content at first, see `BaseVisibilityFormField`. */
export const baseVisibilityField = customField(
	{ initialValue: "PUBLIC" },
	associationIdentifierSchema,
);

/** Who sees the content in addition from a later time on ("if not found by then"), see `NotFoundVisibilityFormField`. */
export const notFoundVisibilityField = customField(
	{ initialValue: { at: null, forAssociation: "PUBLIC" } },
	v.object({
		at: v.pipe(
			v.nullish(preprocess(date, v.date())),
			v.check((at) => {
				if (!at) return true;
				if (at < sub(new Date(), { days: 1 })) return false;
				return true;
			}, "forms:errors.dateInPast"),
		),
		forAssociation: associationIdentifierSchema,
	}),
);

type VisibilityFormValues = {
	baseVisibility: v.InferOutput<typeof baseVisibilityField>;
	notFoundVisibility: v.InferOutput<typeof notFoundVisibilityField>;
};

/**
 * Issues of the visibility fields compared to each other and to when the content starts: the staged audience
 * has to differ from the base one, can't be set for public content and has to come into effect before the start.
 */
export function visibilityIssues(
	values: VisibilityFormValues,
	{
		startsAt,
		messages = {
			afterStart: "forms:errors.dateAfterScrimDate",
			startingNow: "forms:errors.canNotSetIfLookingNow",
		},
	}: {
		startsAt: Date;
		messages?: { afterStart: string; startingNow: string };
	},
): Array<{ path: ["notFoundVisibility"]; message: string }> {
	const issue = (message: string) => ({
		path: ["notFoundVisibility"] as ["notFoundVisibility"],
		message,
	});
	const issues: Array<ReturnType<typeof issue>> = [];

	const { at, forAssociation } = values.notFoundVisibility;

	if (at && forAssociation === values.baseVisibility) {
		issues.push(issue("forms:errors.visibilityMustBeDifferent"));
	}

	if (values.baseVisibility === "PUBLIC" && at) {
		issues.push(issue("forms:errors.visibilityNotAllowedWhenPublic"));
	}

	if (at && at > startsAt) {
		issues.push(issue(messages.afterStart));
	}

	if (at && startsAt < new Date()) {
		issues.push(issue(messages.startingNow));
	}

	return issues;
}
