import { z } from "zod";
import {
	_action,
	checkboxValueToBoolean,
	deduplicate,
	falsyToNull,
	friendCode,
	id,
	modeShort,
	safeJSONParse,
	stageId,
	weaponSplId,
} from "~/utils/zod";
import { matchEndedAtIndex } from "./core/match";
import { SENDOUQ, SENDOUQ_BEST_OF } from "./q-constants";

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

const winners = z.preprocess(
	safeJSONParse,
	z
		.array(z.enum(["ALPHA", "BRAVO"]))
		.max(SENDOUQ_BEST_OF)
		.refine((val) => {
			if (val.length === 0) return true;

			const matchEndedAt = matchEndedAtIndex(val);

			// match did end
			if (matchEndedAt === null) return true;

			// no extra scores after match ended
			return val.length === matchEndedAt + 1;
		}),
);

const weapons = z.preprocess(
	safeJSONParse,
	z
		.array(
			z.object({
				weaponSplId,
				userId: id,
				mapIndex: z.number().int().nonnegative(),
				groupMatchMapId: id,
			}),
		)
		.nullish()
		.default([]),
);
export const matchSchema = z.union([
	z.object({
		_action: _action("REPORT_SCORE"),
		winners,
		weapons,
		adminReport: z.preprocess(
			checkboxValueToBoolean,
			z.boolean().nullish().default(false),
		),
	}),
	z.object({
		_action: _action("LOOK_AGAIN"),
		previousGroupId: id,
	}),
	z.object({
		_action: _action("REPORT_WEAPONS"),
		weapons,
	}),
	z.object({
		_action: _action("ADD_PRIVATE_USER_NOTE"),
		comment: z.preprocess(
			falsyToNull,
			z.string().max(SENDOUQ.PRIVATE_USER_NOTE_MAX_LENGTH).nullable(),
		),
		sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
		targetId: id,
	}),
]);

export const weaponUsageSearchParamsSchema = z.object({
	userId: id,
	season: z.coerce.number().int(),
	stageId,
	modeShort,
});

export const qMatchPageParamsSchema = z.object({
	id,
});
