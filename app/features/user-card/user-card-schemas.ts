import * as v from "valibot";
import { SENDOUQ } from "~/features/sendouq/q-constants";
import {
	customField,
	image,
	numberFieldOptional,
	radioGroup,
	select,
	selectOptional,
	stageSelect,
	stringConstant,
	textAreaOptional,
	toggle,
} from "~/form/fields";
import { _action, id } from "~/utils/schema";
import { preferenceEmojiUrl } from "~/utils/urls";
import { PRESET_COLORS } from "../tier-list-maker/tier-list-maker-constants";
import { USER_CARD } from "./user-card-constants";

export const updateUserCardSchema = v.object({
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
	bannerColor: customField(
		{ initialValue: PRESET_COLORS[0] },
		v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/i)),
	),
	bannerStageId: stageSelect({ label: "labels.bannerStage" }),
	bannerImage: image({
		label: "labels.bannerImage",
		dimensions: "thick-banner",
		autoValidate: true,
	}),
	xpDivision: selectOptional({
		label: "labels.division",
		bottomText: "bottomTexts.xpDivision",
		items: [
			{ label: "options.xpDivision.WEST", value: "WEST" },
			{ label: "options.xpDivision.JPN", value: "JPN" },
		],
	}),
	unverifiedXpPoints: numberFieldOptional({
		label: "labels.unverifiedXp",
		bottomText: "bottomTexts.unverifiedXp",
	}),
	hideXp: toggle({ label: "labels.hideXp" }),
	hideDiv: toggle({ label: "labels.hideDiv" }),
});

export const userCardNoteSaveSchema = v.object({
	_action: stringConstant("SAVE"),
	comment: textAreaOptional({
		label: "labels.comment",
		maxLength: SENDOUQ.PRIVATE_USER_NOTE_MAX_LENGTH,
	}),
	sentiment: radioGroup({
		label: "labels.sentiment",
		bottomText: "bottomTexts.sentiment",
		items: [
			{
				value: "POSITIVE",
				label: "options.sentiment.POSITIVE",
				imgSrc: preferenceEmojiUrl("PREFER"),
			},
			{
				value: "NEUTRAL",
				label: "options.sentiment.NEUTRAL",
				imgSrc: preferenceEmojiUrl(),
			},
			{
				value: "NEGATIVE",
				label: "options.sentiment.NEGATIVE",
				imgSrc: preferenceEmojiUrl("AVOID"),
			},
		],
	}),
});

export const userCardNoteSchema = v.union([
	userCardNoteSaveSchema,
	v.object({
		_action: _action("DELETE"),
	}),
]);

export const userCardNoteParamsSchema = v.object({
	id,
});
