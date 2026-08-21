import * as v from "valibot";
import { _action, deduplicate, id, preprocess } from "~/utils/schema";
import { addFriendCodeSchema, updateGroupNoteSchema } from "./q-schemas";

export const frontPageSchema = v.union([
	v.object({
		_action: _action("JOIN_QUEUE"),
		direct: v.optional(preprocess(deduplicate, v.nullish(v.literal("true")))),
	}),
	v.object({
		_action: _action("JOIN_TEAM"),
	}),
	addFriendCodeSchema,
]);

export const preparingSchema = v.union([
	v.object({
		_action: _action("JOIN_QUEUE"),
	}),
	v.object({
		_action: _action("ADD_FRIEND"),
		id,
	}),
]);

export const lookingSchema = v.union([
	v.object({
		_action: _action("LIKE"),
		targetGroupId: id,
	}),
	v.object({
		_action: _action("RECHALLENGE"),
		targetGroupId: id,
	}),
	v.object({
		_action: _action("UNLIKE"),
		targetGroupId: id,
	}),
	v.object({
		_action: _action("SUGGEST"),
		targetGroupId: id,
	}),
	v.object({
		_action: _action("GROUP_UP"),
		targetGroupId: id,
	}),
	v.object({
		_action: _action("MATCH_UP"),
		targetGroupId: id,
	}),
	v.object({
		_action: _action("LEAVE_GROUP"),
	}),
	v.object({
		_action: _action("KICK_FROM_GROUP"),
		userId: id,
	}),
	v.object({
		_action: _action("REFRESH_GROUP"),
	}),
	updateGroupNoteSchema,
]);

export const readySchema = v.object({
	_action: _action("CONFIRM_READY"),
});
