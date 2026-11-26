import * as v from "valibot";
import {
	mainWeaponIdSchema,
	modeShortSchema,
	scannerAbilitySchema,
	stageIdSchema,
} from "~/features/scanner/scanner-schemas";
import { stringConstant } from "~/form/fields";
import { id } from "~/utils/schema";
import {
	BROADCAST_CSS_MAX_LENGTH,
	BROADCAST_GAME_END_TRIGGERS,
	BROADCAST_GAME_SUMMARY_MAX_OBJECTIVE_READS,
	BROADCAST_MAX_THEME_VARIABLES,
	BROADCAST_SDP_MAX_LENGTH,
	BROADCAST_THEME_VARIABLE_MAX_LENGTH,
	BROADCAST_WEAPON_IMAGES,
} from "./broadcast-constants";
import * as ThemeSettings from "./core/ThemeSettings";

const channelSlug = v.pipe(v.string(), v.minLength(1), v.maxLength(100));

export const broadcastParamsSchema = v.object({ id, channel: channelSlug });

/** The designer saving its theme: the weapon images, the settings (variables set in its form) and the custom CSS (left out when empty). */
export const broadcastThemeSchema = v.object({
	_action: stringConstant("UPDATE_THEME"),
	weaponImages: v.picklist(BROADCAST_WEAPON_IMAGES),
	variables: v.optional(
		v.pipe(
			v.record(
				v.pipe(v.string(), v.check(ThemeSettings.isValidName)),
				v.pipe(
					v.string(),
					v.maxLength(BROADCAST_THEME_VARIABLE_MAX_LENGTH),
					v.check(ThemeSettings.isValidValue),
				),
			),
			v.maxEntries(BROADCAST_MAX_THEME_VARIABLES),
		),
		{},
	),
	css: v.optional(v.pipe(v.string(), v.maxLength(BROADCAST_CSS_MAX_LENGTH))),
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
const inks = v.tuple([inkRgb, inkRgb]);

const teamIndex = v.nullable(v.picklist([0, 1]));
const count = v.nullable(
	v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
);
const gameSummaryPlayer = v.object({
	name: v.nullable(v.pipe(v.string(), v.maxLength(32))),
	weaponSplId: v.nullable(mainWeaponIdSchema),
	abilities: v.pipe(v.array(scannerAbilitySchema), v.maxLength(3)),
});
const gameSummaryTeam = v.object({
	players: v.pipe(v.array(gameSummaryPlayer), v.maxLength(4)),
});
const gameSummary = v.object({
	mode: v.nullable(modeShortSchema),
	stageId: v.nullable(stageIdSchema),
	isKnockout: v.boolean(),
	winner: teamIndex,
	inks: v.tuple([v.nullable(inkRgb), v.nullable(inkRgb)]),
	teams: v.tuple([gameSummaryTeam, gameSummaryTeam]),
	objective: v.pipe(
		v.array(
			v.object({
				t: v.pipe(v.number(), v.integer(), v.minValue(0)),
				score: v.tuple([count, count]),
				control: teamIndex,
			}),
		),
		v.maxLength(BROADCAST_GAME_SUMMARY_MAX_OBJECTIVE_READS),
	),
});

export const broadcastGameSignalSchema = v.variant("type", [
	v.object({ type: v.literal("start"), inks: v.nullable(inks) }),
	v.object({ type: v.literal("ink"), inks }),
	v.object({
		type: v.literal("end"),
		// a scanner page loaded before triggers existed reports the HUD going away alone
		trigger: v.optional(v.picklist(BROADCAST_GAME_END_TRIGGERS), "hudGone"),
		summary: v.nullable(gameSummary),
	}),
]);
