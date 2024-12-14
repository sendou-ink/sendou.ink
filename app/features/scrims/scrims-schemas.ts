import { z } from "zod";
import { _action, id } from "~/utils/zod";

export const deletePostSchema = z.object({
	_action: _action("DELETE_POST"),
	scrimPostId: id,
});

export const newRequestSchema = z.object({
	_action: _action("NEW_REQUEST"),
	scrimPostId: id,
	from: z.union([
		z.object({ mode: z.literal("PICKUP"), users: z.array(id).min(3).max(6) }),
		z.object({ mode: z.literal("TEAM"), teamId: id }),
	]),
});

export const acceptRequestSchema = z.object({
	_action: _action("ACCEPT_REQUEST"),
	scrimPostRequestId: id,
});

export const cancelRequestSchema = z.object({
	_action: _action("CANCEL_REQUEST"),
	scrimPostRequestId: id,
});

export const scrimsActionSchema = z.union([
	deletePostSchema,
	newRequestSchema,
	acceptRequestSchema,
	cancelRequestSchema,
]);
