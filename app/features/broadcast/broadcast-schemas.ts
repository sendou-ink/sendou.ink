import * as v from "valibot";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import {
	array,
	fieldset,
	idConstant,
	select,
	stringConstant,
	textAreaOptional,
	textField,
	textFieldOptional,
	weaponPool,
} from "~/form/fields";
import { _action, coerceNumber, id } from "~/utils/schema";
import {
	BROADCAST_CASTER_NAME_MAX_LENGTH,
	BROADCAST_CSS_MAX_LENGTH,
	BROADCAST_HEADLINE_MAX_LENGTH,
	BROADCAST_INK_COLORS,
	BROADCAST_MAX_CASTERS,
	BROADCAST_MAX_PLAYERS_PER_TEAM,
	BROADCAST_PLAYER_NAME_MAX_LENGTH,
	BROADCAST_SCENES,
	BROADCAST_STINGERS,
	BROADCAST_TRANSITIONS,
	BROADCAST_WEAPONS_PER_PLAYER,
} from "./broadcast-constants";

const nonNegativeInteger = v.pipe(coerceNumber(), v.integer(), v.minValue(0));
const channelSlug = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
const scene = v.picklist(BROADCAST_SCENES);
const transition = v.picklist(BROADCAST_TRANSITIONS);
const booleanString = v.pipe(
	v.picklist(["true", "false"]),
	v.transform((value) => value === "true"),
);

export const broadcastParamsSchema = v.object({ id, channel: channelSlug });

export const broadcastThemeFormSchema = v.object({
	_action: stringConstant("UPDATE_THEME"),
	stinger: select({
		label: "labels.broadcastStinger",
		bottomText: "bottomTexts.broadcastStinger",
		items: BROADCAST_STINGERS.map((stinger) => ({
			value: stinger,
			label: `options.broadcastStinger.${stinger}` as const,
		})),
	}),
	css: textAreaOptional({
		label: "labels.broadcastCss",
		bottomText: "bottomTexts.broadcastCss",
		maxLength: BROADCAST_CSS_MAX_LENGTH,
	}),
});

export const broadcastInfoFormSchema = v.object({
	_action: stringConstant("UPDATE_INFO"),
	headline: textFieldOptional({
		label: "labels.broadcastHeadline",
		bottomText: "bottomTexts.broadcastHeadline",
		maxLength: BROADCAST_HEADLINE_MAX_LENGTH,
	}),
	casters: array({
		label: "labels.broadcastCasters",
		bottomText: "bottomTexts.broadcastCasters",
		max: BROADCAST_MAX_CASTERS,
		field: textField({ maxLength: BROADCAST_CASTER_NAME_MAX_LENGTH }),
	}),
});

export const broadcastTeamFormSchema = v.object({
	_action: stringConstant("UPDATE_TEAM"),
	teamId: idConstant(),
	name: textField({
		label: "labels.teamName",
		maxLength: TOURNAMENT.TEAM_NAME_MAX_LENGTH,
	}),
	players: array({
		label: "labels.broadcastPlayers",
		max: BROADCAST_MAX_PLAYERS_PER_TEAM,
		addable: false,
		field: fieldset({
			fields: v.object({
				userId: idConstant(),
				name: textField({
					label: "labels.name",
					maxLength: BROADCAST_PLAYER_NAME_MAX_LENGTH,
				}),
				weapons: weaponPool({
					label: "labels.broadcastWeapons",
					maxCount: BROADCAST_WEAPONS_PER_PLAYER,
					disableFavorites: true,
				}),
			}),
		}),
	}),
});

export const broadcastActionSchema = v.union([
	v.object({ _action: _action("SET_NEXT_SCENE"), scene }),
	v.object({ _action: _action("SET_NEXT_TRANSITION"), transition }),
	v.object({
		_action: _action("SET_NEXT_INK"),
		/** `undefined` goes back to the theme's team colors. */
		key: v.optional(v.picklist(BROADCAST_INK_COLORS.map((color) => color.key))),
		isFlipped: booleanString,
	}),
	v.object({
		_action: _action("SET_NEXT_SWAP_SIDES"),
		swapSides: booleanString,
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
	v.object({ _action: _action("RESET_TEAM"), teamId: id }),
	broadcastThemeFormSchema,
	broadcastInfoFormSchema,
	broadcastTeamFormSchema,
]);
