import * as v from "valibot";
import {
	BROADCAST_ADVANCES,
	BROADCAST_INK_COLORS,
	BROADCAST_TRANSITIONS,
} from "~/features/broadcast/broadcast-constants";
import { broadcastThemeSchema } from "~/features/broadcast/broadcast-schemas";
import { CLIP_MOMENTS } from "~/features/scanner/core/clips/moments";
import {
	array,
	fieldset,
	numberField,
	selectDynamicOptional,
	stringConstant,
	textFieldOptional,
	toggle,
	userSearch,
} from "~/form/fields";
import {
	_action,
	coerceNumber,
	id,
	preprocess,
	safeJSONParse,
} from "~/utils/schema";
import {
	BROADCAST_CLIP_MAX_DURATION_MS,
	BROADCAST_HEADLINE_MAX_LENGTH,
	BROADCAST_MAX_CASTERS,
	BROADCAST_OBS_INPUT_NAME_MAX_LENGTH,
	BROADCAST_OBS_PASSWORD_MAX_LENGTH,
	BROADCAST_SCENE_DURATIONS_MS,
	BROADCAST_SCENES,
	BROADCAST_VDO_NINJA_URL_MAX_LENGTH,
} from "./broadcast-cast-constants";
import { isVdoNinjaViewUrl } from "./broadcast-cast-utils";

const nonNegativeInteger = v.pipe(coerceNumber(), v.integer(), v.minValue(0));
const scene = v.picklist(BROADCAST_SCENES);
const transition = v.picklist(BROADCAST_TRANSITIONS);
const clip = preprocess(
	safeJSONParse,
	v.object({
		id: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
		durationMs: v.pipe(
			v.number(),
			v.integer(),
			v.minValue(1),
			v.maxValue(BROADCAST_CLIP_MAX_DURATION_MS),
		),
		kills: v.pipe(v.number(), v.integer(), v.minValue(0)),
		moments: v.pipe(
			v.array(v.picklist(CLIP_MOMENTS)),
			v.minLength(1),
			v.maxLength(CLIP_MOMENTS.length),
		),
	}),
);
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
		maxLength: BROADCAST_HEADLINE_MAX_LENGTH,
	}),
});

export const broadcastCastersFormSchema = v.object({
	_action: stringConstant("UPDATE_CASTERS"),
	casters: array({
		label: "labels.broadcastCasters",
		max: BROADCAST_MAX_CASTERS,
		field: fieldset({
			fields: v.object({
				userId: userSearch({ label: "labels.user" }),
				vdoNinjaUrl: textFieldOptional({
					label: "labels.broadcastVdoNinjaUrl",
					placeholder: "placeholders.broadcastVdoNinjaUrl",
					maxLength: BROADCAST_VDO_NINJA_URL_MAX_LENGTH,
					validate: {
						func: isVdoNinjaViewUrl,
						message: "forms:errors.invalidVdoNinjaUrl",
					},
				}),
				isAudioOnly: toggle({
					label: "labels.broadcastCasterAudioOnly",
				}),
			}),
		}),
	}),
});

export const broadcastObsAudioFormSchema = v.object({
	_action: stringConstant("UPDATE_OBS_AUDIO"),
	port: numberField({
		label: "labels.broadcastObsPort",
		bottomText: "bottomTexts.broadcastObsPort",
		min: 1,
		max: 65_535,
	}),
	password: textFieldOptional({
		label: "labels.broadcastObsPassword",
		bottomText: "bottomTexts.broadcastObsPassword",
		maxLength: BROADCAST_OBS_PASSWORD_MAX_LENGTH,
		inputType: "password",
	}),
	inputName: textFieldOptional({
		label: "labels.broadcastObsInputName",
		bottomText: "bottomTexts.broadcastObsInputName",
		placeholder: "placeholders.broadcastObsInputName",
		maxLength: BROADCAST_OBS_INPUT_NAME_MAX_LENGTH,
	}),
});

/** Renders `broadcastObsAudioFormSchema`'s `inputName` as a dropdown of the sources read from OBS. */
export const broadcastObsInputNameSelectField = selectDynamicOptional({
	label: "labels.broadcastObsInputName",
	bottomText: "bottomTexts.broadcastObsInputNameSelect",
});

export const broadcastActionSchema = v.union([
	v.object({ _action: _action("SET_SCENE"), itemId: id, scene }),
	v.object({ _action: _action("SET_TRANSITION"), itemId: id, transition }),
	v.object({
		_action: _action("SET_INK"),
		/** `undefined` goes back to the theme's team colors. */
		key: v.optional(v.picklist(BROADCAST_INK_COLORS.map((color) => color.key))),
		/** The featured match and how many of its results are on air, identifying the game on air. */
		matchId: id,
		resultCount: nonNegativeInteger,
	}),
	v.object({
		_action: _action("SET_SWAP_SIDES"),
		swapSides: booleanString,
	}),
	v.object({
		_action: _action("SET_BRACKET"),
		itemId: id,
		/** `undefined` follows the featured match's bracket. */
		bracketIdx: v.optional(nonNegativeInteger),
	}),
	v.object({
		_action: _action("SET_BRACKET_SIDE"),
		itemId: id,
		side: v.picklist(["winners", "losers"]),
		/** See `BroadcastBracketSideFocus`. */
		focus: v.union([v.picklist(["hidden", "remaining"]), nonNegativeInteger]),
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
		clip: v.optional(clip),
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
	v.object({
		_action: _action("SET_CASTER_VOLUME"),
		userId: id,
		volume: v.pipe(coerceNumber(), v.integer(), v.minValue(0), v.maxValue(100)),
	}),
	v.object({ _action: _action("ADD_TO_QUEUE") }),
	v.object({ _action: _action("POINT_PROGRAM") }),
	v.object({ _action: _action("REGENERATE_PROGRAM_KEY") }),
	v.object({ _action: _action("REMOVE_FROM_QUEUE"), itemId: id }),
	v.object({
		_action: _action("MOVE_IN_QUEUE"),
		itemId: id,
		/** Where among the staged items it goes, `0` being next. */
		toIndex: nonNegativeInteger,
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
	broadcastThemeSchema,
	broadcastHeadlineFormSchema,
	broadcastCastersFormSchema,
	broadcastObsAudioFormSchema,
]);
