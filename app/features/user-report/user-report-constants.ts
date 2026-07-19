import type { UserReportCategory } from "~/db/tables";

export const USER_REPORT = {
	DESCRIPTION_MAX_LENGTH: 2000,
	MATCH_ID_MAX_LENGTH: 10,
};

/** English display names, shown on the staff-only admin tab and in the Discord webhook embed. */
export const USER_REPORT_CATEGORY_LABELS: Record<UserReportCategory, string> = {
	INAPPROPRIATE_CONTENT: "Inappropriate content",
	ALTING: "Alting",
	HARASSMENT: "Harassment",
	CHEATING: "Cheating",
	OTHER: "Other",
};
