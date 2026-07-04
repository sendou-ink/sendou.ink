import { z } from "zod";
import { SENDOUQ } from "~/features/sendouq/q-constants";
import {
	customField,
	image,
	numberFieldOptional,
	select,
	stageSelect,
	textAreaOptional,
	toggle,
} from "~/form/fields";
import { _action, falsyToNull, id } from "~/utils/zod";
import { PRESET_COLORS } from "../tier-list-maker/tier-list-maker-constants";
import { USER_CARD } from "./user-card-constants";

export const updateUserCardSchema = z.object({
	shortBio: textAreaOptional({
		label: "labels.shortBio",
		maxLength: USER_CARD.SHORT_BIO_MAX_LENGTH,
	}),
	bannerType: select({
		label: "labels.banner",
		items: [
			{ label: "options.bannerType.COLOR", value: "COLOR" },
			{ label: "options.bannerType.STAGE", value: "STAGE" },
			{ label: "options.bannerType.URL", value: "URL" },
		],
	}),
	bannerColor: customField({ initialValue: PRESET_COLORS[0] }, z.string()),
	bannerStageId: stageSelect({ label: "labels.bannerStage" }),
	bannerImage: image({
		label: "labels.bannerImage",
		dimensions: "thick-banner",
		autoValidate: true,
	}),
	unverifiedXpPoints: numberFieldOptional({
		label: "labels.unverifiedXp",
		bottomText: "bottomTexts.unverifiedXp",
	}),
	unverifiedXpDivision: select({
		label: "labels.division",
		items: [
			{ label: "options.xpDivision.WEST", value: "WEST" },
			{ label: "options.xpDivision.JPN", value: "JPN" },
		],
	}),
	hideXp: toggle({ label: "labels.hideXp" }),
	hideDiv: toggle({ label: "labels.hideDiv" }),
});

export const userCardNoteSchema = z.union([
	z.object({
		_action: _action("SAVE"),
		comment: z.preprocess(
			falsyToNull,
			z.string().max(SENDOUQ.PRIVATE_USER_NOTE_MAX_LENGTH).nullable(),
		),
		sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
	}),
	z.object({
		_action: _action("DELETE"),
	}),
]);

export const userCardNoteParamsSchema = z.object({
	id,
});
