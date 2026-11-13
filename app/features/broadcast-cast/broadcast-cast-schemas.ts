import * as v from "valibot";
import {
	BROADCAST_ADVANCES,
	BROADCAST_INK_COLORS,
	BROADCAST_TRANSITIONS,
} from "~/features/broadcast/broadcast-constants";
import {
	broadcastGameDelayFormSchema,
	broadcastThemeFormSchema,
} from "~/features/broadcast/broadcast-schemas";
import {
	array,
	stringConstant,
	textFieldOptional,
	userSearch,
} from "~/form/fields";
import { _action, coerceNumber, id } from "~/utils/schema";
import {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_HEADLINE_MAX_LENGTH,
	BROADCAST_MAX_CASTERS,
	BROADCAST_SCENE_DURATIONS_MS,
	BROADCAST_SCENES,
} from "./broadcast-cast-constants";

const nonNegativeInteger = v.pipe(coerceNumber(), v.integer(), v.minValue(0));
const scene = v.picklist(BROADCAST_SCENES);
const transition = v.picklist(BROADCAST_TRANSITIONS);
const clipId = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
const durationMs = v.pipe(
	coerceNumber(),
	v.picklist(
		Object.values(BROADCAST_SCENE_DURATIONS_MS).flatMap(
			(durations) => durations.optionsMs,
		),
	),
);
const booleanString = v.pipe(
	v.picklist(["true", "false"]),
	v.transform((value) => value === "true"),
);

export const broadcastHeadlineFormSchema = v.object({
	_action: stringConstant("UPDATE_HEADLINE"),
	headline: textFieldOptional({
		label: "labels.broadcastHeadline",
		bottomText: "bottomTexts.broadcastHeadline",
		maxLength: BROADCAST_HEADLINE_MAX_LENGTH,
	}),
});

export const broadcastCastersFormSchema = v.object({
	_action: stringConstant("UPDATE_CASTERS"),
	casterIds: array({
		label: "labels.broadcastCasters",
		bottomText: "bottomTexts.broadcastCasters",
		max: BROADCAST_MAX_CASTERS,
		field: userSearch({ label: "labels.user" }),
	}),
});

export const broadcastActionSchema = v.union([
	v.object({ _action: _action("SET_SCENE"), itemId: id, scene }),
	v.object({ _action: _action("SET_TRANSITION"), itemId: id, transition }),
	v.object({
		_action: _action("SET_INK"),
		/** `undefined` goes back to the theme's team colors. */
		key: v.optional(v.picklist(BROADCAST_INK_COLORS.map((color) => color.key))),
		isFlipped: booleanString,
		/** The featured match and how many of its results are on air, identifying the game on air. */
		matchId: id,
		resultCount: nonNegativeInteger,
	}),
	v.object({
		_action: _action("SET_SWAP_SIDES"),
		itemId: id,
		swapSides: booleanString,
	}),
	v.object({
		_action: _action("SET_BRACKET"),
		itemId: id,
		/** `undefined` follows the featured match's bracket. */
		bracketIdx: v.optional(nonNegativeInteger),
	}),
	v.object({
		_action: _action("SET_BRACKET_FOCUS"),
		itemId: id,
		focus: v.picklist(BROADCAST_BRACKET_FOCUSES),
	}),
	v.object({
		_action: _action("SET_TEAM"),
		itemId: id,
		teamPick: v.union([v.picklist(["left", "right"]), id]),
	}),
	v.object({
		_action: _action("SET_CLIP"),
		itemId: id,
		/** `undefined` leaves the replays footage to OBS. */
		clipId: v.optional(clipId),
	}),
	v.object({
		_action: _action("SET_DURATION"),
		itemId: id,
		/** `undefined` stays on air until a Take. */
		durationMs: v.optional(durationMs),
	}),
	v.object({
		_action: _action("SET_ADVANCE"),
		itemId: id,
		advance: v.picklist(BROADCAST_ADVANCES),
	}),
	v.object({ _action: _action("ADD_TO_QUEUE") }),
	v.object({ _action: _action("GENERATE_PROGRAM_KEY") }),
	v.object({ _action: _action("REMOVE_FROM_QUEUE"), itemId: id }),
	v.object({
		_action: _action("MOVE_IN_QUEUE"),
		itemId: id,
		direction: v.picklist(["earlier", "later"]),
	}),
	v.object({
		_action: _action("TAKE"),
		takeId: nonNegativeInteger,
		/** The featured match and how many of its results next showed, `undefined` without a match. */
		matchId: v.optional(id),
		resultCount: v.optional(nonNegativeInteger),
	}),
	v.object({
		_action: _action("SHOW_RESULTS"),
		matchId: id,
		resultCount: nonNegativeInteger,
	}),
	broadcastThemeFormSchema,
	broadcastGameDelayFormSchema,
	broadcastHeadlineFormSchema,
	broadcastCastersFormSchema,
]);
