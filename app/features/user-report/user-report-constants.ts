export const USER_REPORT = {
	DESCRIPTION_MAX_LENGTH: 2000,
	MATCH_ID_MAX_LENGTH: 10,
};

/** Offered in the dialog but never stored: picking it points the user to Splatoon 3 / Discord instead. */
export const INAPPROPRIATE_NICKNAME_CATEGORY = "INAPPROPRIATE_NICKNAME";

export const USER_REPORT_CATEGORIES = [
	"INAPPROPRIATE_CONTENT",
	"ALTING",
	"HARASSMENT",
	"CHEATING",
	"OTHER",
] as const;

export type UserReportCategory = (typeof USER_REPORT_CATEGORIES)[number];

/** English names for the staff-only admin tab and the Discord webhook embed. */
export const USER_REPORT_CATEGORY_LABELS: Record<UserReportCategory, string> = {
	INAPPROPRIATE_CONTENT: "Inappropriate content",
	ALTING: "Alting",
	HARASSMENT: "Harassment",
	CHEATING: "Cheating",
	OTHER: "Other",
};
