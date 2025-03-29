import { z } from "zod";
import { _action, actuallyNonEmptyStringOrNull, id } from "~/utils/zod";

const createNewAssociationSchema = z.object({
	_action: _action("CREATE_ASSOCIATION"),
	name: z.preprocess(actuallyNonEmptyStringOrNull, z.string().max(100)),
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
	createNewAssociationSchema,
	removeMemberSchema,
	deleteAssociationSchema,
]);
