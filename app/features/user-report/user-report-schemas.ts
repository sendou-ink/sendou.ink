import { z } from "zod";
import { select, textAreaRequired } from "~/form/fields";
import { id } from "~/utils/zod";
import { USER_REPORT } from "./user-report-constants";

export const reportUserSchema = z.object({
	category: select({
		label: "labels.reportCategory",
		items: [
			{
				label: "options.userReportCategory.INAPPROPRIATE_CONTENT",
				value: "INAPPROPRIATE_CONTENT",
			},
			{ label: "options.userReportCategory.ALTING", value: "ALTING" },
			{ label: "options.userReportCategory.HARASSMENT", value: "HARASSMENT" },
			{ label: "options.userReportCategory.CHEATING", value: "CHEATING" },
			{ label: "options.userReportCategory.OTHER", value: "OTHER" },
		],
	}),
	description: textAreaRequired({
		label: "labels.description",
		maxLength: USER_REPORT.DESCRIPTION_MAX_LENGTH,
	}),
});

export const reportUserParamsSchema = z.object({
	id,
});
