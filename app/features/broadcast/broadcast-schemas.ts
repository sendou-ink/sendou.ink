import * as v from "valibot";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import {
	array,
	fieldset,
	idConstant,
	stringConstant,
	textAreaOptional,
	textField,
	weaponPool,
} from "~/form/fields";
import { _action, coerceNumber, id } from "~/utils/schema";
import {
	BROADCAST_CSS_MAX_LENGTH,
	BROADCAST_MAX_PLAYERS_PER_TEAM,
	BROADCAST_PLAYER_NAME_MAX_LENGTH,
	BROADCAST_SCENES,
	BROADCAST_WEAPONS_PER_PLAYER,
} from "./broadcast-constants";

const nonNegativeInteger = v.pipe(coerceNumber(), v.integer(), v.minValue(0));
const channelSlug = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
const scene = v.picklist(BROADCAST_SCENES);
const booleanString = v.pipe(
	v.picklist(["true", "false"]),
	v.transform((value) => value === "true"),
);

export const broadcastParamsSchema = v.object({ id, channel: channelSlug });

export const broadcastThemeFormSchema = v.object({
	_action: stringConstant("UPDATE_THEME"),
	css: textAreaOptional({
		label: "labels.broadcastCss",
		bottomText: "bottomTexts.broadcastCss",
		maxLength: BROADCAST_CSS_MAX_LENGTH,
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
	broadcastTeamFormSchema,
]);
