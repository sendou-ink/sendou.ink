import * as v from "valibot";
import { select, textArea, textFieldOptional } from "~/form/fields";
import { id } from "~/utils/schema";
import {
	INAPPROPRIATE_NICKNAME_CATEGORY,
	USER_REPORT,
} from "./user-report-constants";

export const reportUserSchema = v.object({
	category: select({
		label: "labels.reportCategory",
		items: [
			{
				label: "options.userReportCategory.INAPPROPRIATE_CONTENT",
				value: "INAPPROPRIATE_CONTENT",
			},
			{
				label: "options.userReportCategory.INAPPROPRIATE_NICKNAME",
				value: INAPPROPRIATE_NICKNAME_CATEGORY,
			},
			{ label: "options.userReportCategory.ALTING", value: "ALTING" },
			{ label: "options.userReportCategory.HARASSMENT", value: "HARASSMENT" },
			{ label: "options.userReportCategory.CHEATING", value: "CHEATING" },
			{ label: "options.userReportCategory.OTHER", value: "OTHER" },
		],
	}),
	description: textArea({
		label: "labels.description",
		maxLength: USER_REPORT.DESCRIPTION_MAX_LENGTH,
	}),
	matchId: textFieldOptional({
		label: "labels.reportMatchId",
		bottomText: "bottomTexts.reportMatchId",
		maxLength: USER_REPORT.MATCH_ID_MAX_LENGTH,
	}),
});

export const reportUserParamsSchema = v.object({
	id,
});
