import * as v from "valibot";
import {
	array,
	radioGroup,
	stringConstant,
	textAreaOptional,
	textFieldOptional,
	userSearch,
} from "~/form/fields";
import { _action, coerceNumber, id } from "~/utils/schema";
import {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_CSS_MAX_LENGTH,
	BROADCAST_DURATIONS_MS,
	BROADCAST_HEADLINE_MAX_LENGTH,
	BROADCAST_INK_COLORS,
	BROADCAST_MAX_CASTERS,
	BROADCAST_SCENES,
	BROADCAST_SDP_MAX_LENGTH,
	BROADCAST_TRANSITIONS,
	BROADCAST_WEAPON_IMAGES,
} from "./broadcast-constants";

const nonNegativeInteger = v.pipe(coerceNumber(), v.integer(), v.minValue(0));
const channelSlug = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
const scene = v.picklist(BROADCAST_SCENES);
const transition = v.picklist(BROADCAST_TRANSITIONS);
const clipId = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
const booleanString = v.pipe(
	v.picklist(["true", "false"]),
	v.transform((value) => value === "true"),
);

export const broadcastParamsSchema = v.object({ id, channel: channelSlug });

export const broadcastThemeFormSchema = v.object({
	_action: stringConstant("UPDATE_THEME"),
	weaponImages: radioGroup({
		label: "labels.broadcastWeaponImages",
		variant: "chip",
		items: BROADCAST_WEAPON_IMAGES.map((weaponImages) => ({
			value: weaponImages,
			label: `options.broadcastWeaponImages.${weaponImages}` as const,
		})),
	}),
	css: textAreaOptional({
		label: "labels.broadcastCss",
		bottomText: "bottomTexts.broadcastCss",
		maxLength: BROADCAST_CSS_MAX_LENGTH,
	}),
});

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
		_action: _action("SET_CLIP"),
		itemId: id,
		/** `undefined` leaves the replays footage to OBS. */
		clipId: v.optional(clipId),
	}),
	v.object({
		_action: _action("SET_DURATION"),
		itemId: id,
		/** `undefined` stays on air until a Take. */
		durationMs: v.optional(
			v.pipe(coerceNumber(), v.picklist(BROADCAST_DURATIONS_MS)),
		),
	}),
	v.object({
		_action: _action("SET_AUTO"),
		itemId: id,
		isAuto: booleanString,
	}),
	v.object({ _action: _action("ADD_TO_QUEUE") }),
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
	broadcastHeadlineFormSchema,
	broadcastCastersFormSchema,
]);

export const broadcastSignalSchema = v.object({
	/** The posting peer's own token, see `BroadcastOwnPeer`. */
	token: v.pipe(v.string(), v.uuid()),
	to: v.pipe(v.string(), v.uuid()),
	description: v.object({
		type: v.picklist(["offer", "answer"]),
		sdp: v.pipe(v.string(), v.maxLength(BROADCAST_SDP_MAX_LENGTH)),
	}),
});
