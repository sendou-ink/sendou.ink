import * as v from "valibot";
import { radioGroup, stringConstant, textAreaOptional } from "~/form/fields";
import { id } from "~/utils/schema";
import {
	BROADCAST_CSS_MAX_LENGTH,
	BROADCAST_SDP_MAX_LENGTH,
	BROADCAST_WEAPON_IMAGES,
} from "./broadcast-constants";

const channelSlug = v.pipe(v.string(), v.minLength(1), v.maxLength(100));

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

export const broadcastSignalSchema = v.object({
	/** The posting peer's own token, see `BroadcastOwnPeer`. */
	token: v.pipe(v.string(), v.uuid()),
	to: v.pipe(v.string(), v.uuid()),
	description: v.object({
		type: v.picklist(["offer", "answer"]),
		sdp: v.pipe(v.string(), v.maxLength(BROADCAST_SDP_MAX_LENGTH)),
	}),
});

const inkChannel = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(0),
	v.maxValue(255),
);
const inkRgb = v.object({ r: inkChannel, g: inkChannel, b: inkChannel });

export const broadcastGameSignalSchema = v.variant("type", [
	v.object({
		type: v.literal("start"),
		inks: v.nullable(v.tuple([inkRgb, inkRgb])),
	}),
	v.object({ type: v.literal("end") }),
]);
