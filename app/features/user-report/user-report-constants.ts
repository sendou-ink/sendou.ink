export const USER_REPORT = {
	DESCRIPTION_MAX_LENGTH: 2000,
	MATCH_ID_MAX_LENGTH: 10,
};

export const USER_REPORT_CATEGORIES = [
	"INAPPROPRIATE_CONTENT",
	"ALTING",
	"HARASSMENT",
	"CHEATING",
	"OTHER",
] as const;

export type UserReportCategory = (typeof USER_REPORT_CATEGORIES)[number];

/** English display names, shown on the staff-only admin tab and in the Discord webhook embed. */
export const USER_REPORT_CATEGORY_LABELS: Record<UserReportCategory, string> = {
	INAPPROPRIATE_CONTENT: "Inappropriate content",
	ALTING: "Alting",
	HARASSMENT: "Harassment",
	CHEATING: "Cheating",
	OTHER: "Other",
};
