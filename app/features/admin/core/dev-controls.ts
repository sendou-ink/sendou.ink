import { IS_E2E_TEST_RUN } from "~/utils/e2e";

/** Should the user be able to access dev controls? Seeding & user impersonation without auth. */
export const DANGEROUS_CAN_ACCESS_DEV_CONTROLS =
	process.env.NODE_ENV === "development" || IS_E2E_TEST_RUN;
