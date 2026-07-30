import { z } from "zod";
import { _action, deduplicate, id, modeShort, stageId } from "~/utils/zod";
import { addFriendCodeSchema, updateGroupNoteSchema } from "./q-schemas";

export const frontPageSchema = z.union([
	z.object({
		_action: _action("JOIN_QUEUE"),
		direct: z.preprocess(deduplicate, z.literal("true").nullish()),
	}),
	z.object({
		_action: _action("JOIN_TEAM"),
	}),
	addFriendCodeSchema,
]);

export const preparingSchema = z.union([
	z.object({
		_action: _action("JOIN_QUEUE"),
	}),
	z.object({
		_action: _action("ADD_FRIEND"),
		id,
	}),
]);

export const lookingSchema = z.union([
	z.object({
		_action: _action("LIKE"),
		targetGroupId: id,
	}),
	z.object({
		_action: _action("RECHALLENGE"),
		targetGroupId: id,
	}),
	z.object({
		_action: _action("UNLIKE"),
		targetGroupId: id,
	}),
	z.object({
		_action: _action("GROUP_UP"),
		targetGroupId: id,
	}),
	z.object({
		_action: _action("MATCH_UP"),
		targetGroupId: id,
	}),
	z.object({
		_action: _action("GIVE_MANAGER"),
		userId: id,
	}),
	z.object({
		_action: _action("REMOVE_MANAGER"),
		userId: id,
	}),
	z.object({
		_action: _action("LEAVE_GROUP"),
	}),
	z.object({
		_action: _action("KICK_FROM_GROUP"),
		userId: id,
	}),
	z.object({
		_action: _action("REFRESH_GROUP"),
	}),
	updateGroupNoteSchema,
]);

export const weaponUsageSearchParamsSchema = z.object({
	userId: id,
	season: z.coerce.number().int().nonnegative(),
	stageId,
	modeShort,
});
