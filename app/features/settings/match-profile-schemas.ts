import { z } from "zod";
import type { UserMapModePreferences } from "~/db/tables";
import {
	checkboxGroup,
	customField,
	radioGroup,
	stringConstant,
	toggle,
	weaponPool,
} from "~/form/fields";
import { languagesUnified } from "~/modules/i18n/config";
import { modeShort, stageId } from "~/utils/zod";
import {
	AMOUNT_OF_MAPS_IN_POOL_PER_MODE,
	MATCH_PROFILE_WEAPON_POOL_MAX_SIZE,
} from "../match-profile/match-profile-constants";

export const LANGUAGE_OPTIONS = languagesUnified.map((lang) => ({
	label: () => lang.name,
	value: lang.code,
}));

const preferenceSchema = z.enum(["AVOID", "PREFER"]).optional();

export const mapModePreferencesValueSchema = z
	.object({
		modes: z.array(z.object({ mode: modeShort, preference: preferenceSchema })),
		pool: z.array(
			z.object({
				stages: z.array(stageId).max(AMOUNT_OF_MAPS_IN_POOL_PER_MODE),
				mode: modeShort,
			}),
		),
	})
	// Pools for avoided modes are kept in the client form state so they can be
	// restored if the user later un-avoids the mode, but they must not be
	// persisted as active pools. Strip them out before the value reaches the action.
	.transform((val) => ({
		...val,
		pool: val.pool.filter((pool) => {
			const mp = val.modes.find((m) => m.mode === pool.mode);
			return mp?.preference !== "AVOID";
		}),
	}));

export const updateMatchProfileSchema = z.object({
	_action: stringConstant("UPDATE_MATCH_PROFILE"),
	mapModePreferences: customField(
		{ initialValue: { modes: [], pool: [] } satisfies UserMapModePreferences },
		mapModePreferencesValueSchema,
	),
	weaponPool: weaponPool({
		label: "labels.weaponPool",
		maxCount: MATCH_PROFILE_WEAPON_POOL_MAX_SIZE,
	}),
	vc: radioGroup({
		label: "labels.voiceChat",
		items: [
			{ label: "options.voiceChat.yes", value: "YES" },
			{ label: "options.voiceChat.no", value: "NO" },
			{ label: "options.voiceChat.listenOnly", value: "LISTEN_ONLY" },
		],
	}),
	languages: checkboxGroup({
		label: "labels.languages",
		items: LANGUAGE_OPTIONS,
	}),
	noScreen: toggle({
		label: "labels.noScreen",
		bottomText: "bottomTexts.noScreen",
	}),
});
