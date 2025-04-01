import { z } from "zod";
import { _action, actuallyNonEmptyStringOrNull, id } from "~/utils/zod";
import { ASSOCIATION } from "./associations-constants";

export const createNewAssociationSchema = z.object({
	name: z.preprocess(
		actuallyNonEmptyStringOrNull,
		z.string({ message: "Enter a name for the association" }).max(100),
	),
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

export const associationsPageActionSchema = z.union([
	removeMemberSchema,
	deleteAssociationSchema,
]);

const virtualAssociationIdentifierSchema = z.enum(
	ASSOCIATION.VIRTUAL_IDENTIFIERS,
);

export const associationIdentifierSchema = z.union([
	virtualAssociationIdentifierSchema,
	id,
	z.literal("PUBLIC"), // null in DB
]);
