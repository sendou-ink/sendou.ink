import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";

export const DANGEROUS_CAN_ACCESS_DEV_CONTROLS =
	process.env.NODE_ENV === "development" || IS_E2E_TEST_RUN;
