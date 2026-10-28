import type { DEV_ERROR_KINDS } from "./dev-tools-constants";
import {
	logInAsSearchParams,
	usersSearchParams,
} from "./dev-tools-search-params";

export const DEV_IDENTITY_URL = "/dev/identity";
export const DEV_SCENARIOS_URL = "/dev/scenarios";
export const DEV_REQUESTS_URL = "/dev/requests";
export const DEV_SERVER_URL = "/dev/server";
export const DEV_NOTIFICATIONS_URL = "/dev/notifications";
export const DEV_EVENTS_URL = "/dev/events";
export const DEV_SERVER_CONSOLE_URL = "/dev/server-console";
const DEV_LOG_IN_AS_URL = "/dev/log-in-as";

/** Logs in as the user (`null` = back to the real user) via a plain GET, so the link works from a terminal too. */
export const logInAsUrl = ({
	userId,
	returnTo,
}: {
	userId: number | null;
	returnTo: string;
}) => logInAsSearchParams.href(DEV_LOG_IN_AS_URL, { userId, returnTo });

export const devRequestUrl = (id: number) => `${DEV_REQUESTS_URL}/${id}`;

export const devUsersUrl = (ids: number[]) =>
	usersSearchParams.href("/dev/users", { ids });

export const devErrorUrl = (kind: (typeof DEV_ERROR_KINDS)[number]) =>
	`/dev/errors/${kind}`;
