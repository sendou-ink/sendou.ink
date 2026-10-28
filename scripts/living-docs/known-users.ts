/** Test user id constants, who they are in the seeded e2e database and their colour in the docs. */
export const KNOWN_USERS: Record<string, { label: string; color: string }> = {
	ADMIN_ID: { label: "Sendou", color: "#8b5cf6" },
	NZAP_TEST_ID: { label: "N-ZAP", color: "#f59e0b" },
	REGULAR_USER_TEST_ID: { label: "N-ZAP", color: "#f59e0b" },
	ORG_ADMIN_TEST_ID: { label: "Org admin", color: "#0ea5e9" },
	STAFF_TEST_ID: { label: "Staff", color: "#14b8a6" },
	DEV_TEST_ID: { label: "Dev", color: "#64748b" },
};
