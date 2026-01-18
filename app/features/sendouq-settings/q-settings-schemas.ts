import { z } from "zod";
import {
	checkboxGroup,
	radioGroup,
	stringConstant,
	weaponPool,
} from "~/form/fields";
import { languagesUnified } from "~/modules/i18n/config";
import { SENDOUQ_WEAPON_POOL_MAX_SIZE } from "./q-settings-constants";

export const updateWeaponPoolSchema = z.object({
	_action: stringConstant("UPDATE_SENDOUQ_WEAPON_POOL"),
	weaponPool: weaponPool({
		label: "labels.weaponPool",
		maxCount: SENDOUQ_WEAPON_POOL_MAX_SIZE,
	}),
});

const LANGUAGE_OPTIONS = languagesUnified.map((lang) => ({
	label: () => lang.name,
	value: lang.code,
}));

export const updateVoiceChatSchema = z.object({
	_action: stringConstant("UPDATE_VC"),
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
});
