import { z } from "zod";
import {
	_action,
	deduplicate,
	falsyToNull,
	friendCode,
	id,
	modeShort,
	stageId,
} from "~/utils/zod";
import { SENDOUQ } from "./q-constants";

export const frontPageSchema = z.union([
	z.object({
		_action: _action("JOIN_QUEUE"),
		direct: z.preprocess(deduplicate, z.literal("true").nullish()),
	}),
	z.object({
		_action: _action("JOIN_TEAM"),
	}),
	z.object({
		_action: _action("JOIN_TEAM_WITH_TRUST"),
	}),
	z.object({
		_action: _action("ADD_FRIEND_CODE"),
		friendCode,
	}),
]);

export const preparingSchema = z.union([
	z.object({
		_action: _action("JOIN_QUEUE"),
	}),
	z.object({
		_action: _action("ADD_TRUSTED"),
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
		_action: _action("MATCH_UP_RECHALLENGE"),
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
	z.object({
		_action: _action("UPDATE_NOTE"),
		value: z.preprocess(
			falsyToNull,
			z.string().max(SENDOUQ.OWN_PUBLIC_NOTE_MAX_LENGTH).nullable(),
		),
	}),
	z.object({
		_action: _action("DELETE_PRIVATE_USER_NOTE"),
		targetId: id,
	}),
]);

export const weaponUsageSearchParamsSchema = z.object({
	userId: id,
	season: z.coerce.number().int(),
	stageId,
	modeShort,
});
