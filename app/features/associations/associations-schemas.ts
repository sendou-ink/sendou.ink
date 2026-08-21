import * as v from "valibot";
import { textField } from "~/form/fields";
import { _action, id, inviteCode } from "~/utils/schema";
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
	deleteAssociationSchema,
	refreshInviteCodeSchema,
	joinAssociationSchema,
	leaveAssociationSchema,
]);

const virtualAssociationIdentifierSchema = v.picklist(
	ASSOCIATION.VIRTUAL_IDENTIFIERS,
);

export const associationIdentifierSchema = v.union([
	virtualAssociationIdentifierSchema,
	id,
	v.literal("PUBLIC"),
]);
