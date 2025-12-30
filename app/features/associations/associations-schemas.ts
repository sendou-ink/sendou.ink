import { z } from "zod";
import { _action, id, inviteCode, safeStringSchema } from "~/utils/zod";
import { ASSOCIATION } from "./associations-constants";

export const createNewAssociationSchema = z.object({
	name: safeStringSchema({ max: 100 }),
});

const removeMemberSchema = z.object({
	_action: _action("REMOVE_MEMBER"),
	associationId: id,
	userId: id,
});

const deleteAssociationSchema = z.object({
	_action: _action("DELETE_ASSOCIATION"),
	associationId: id,
});

const refreshInviteCodeSchema = z.object({
	_action: _action("REFRESH_INVITE_CODE"),
	associationId: id,
});

const joinAssociationSchema = z.object({
	_action: _action("JOIN_ASSOCIATION"),
	inviteCode,
});

const leaveAssociationSchema = z.object({
	_action: _action("LEAVE_ASSOCIATION"),
	associationId: id,
});

export const associationsPageActionSchema = z.union([
	removeMemberSchema,
	deleteAssociationSchema,
	refreshInviteCodeSchema,
	joinAssociationSchema,
	leaveAssociationSchema,
]);

const virtualAssociationIdentifierSchema = z.enum(
	ASSOCIATION.VIRTUAL_IDENTIFIERS,
);

export const associationIdentifierSchema = z.union([
	virtualAssociationIdentifierSchema,
	id,
	z.literal("PUBLIC"), // null in DB
]);
