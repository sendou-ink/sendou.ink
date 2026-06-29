import { z } from "zod";
import {
	customField,
	image,
	numberFieldOptional,
	select,
	stageSelect,
	textAreaOptional,
	toggle,
} from "~/form/fields";
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
	}),
	unverifiedXpPoints: numberFieldOptional({ label: "labels.unverifiedXp" }),
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
