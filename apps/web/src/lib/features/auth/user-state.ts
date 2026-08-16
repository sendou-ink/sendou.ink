import type { Role } from "#lib/modules/permissions/types.ts";
import { page } from "$app/state";
import type { AuthenticatedUser } from "./user-types.ts";

/** The logged in user as serialized to the client by the root layout. */
export type ClientUser = Omit<AuthenticatedUser, "customTheme" | "patronTier">;

/** The logged in user, or `undefined` when logged out. Reactive to navigation. */
export function loggedInUser(): ClientUser | undefined {
	return page.data.user;
}

/** Whether the logged in user has the given global role. Always `false` when logged out. */
export function hasRole(role: Role): boolean {
	const user = loggedInUser();
	if (!user) return false;
	return user.roles.includes(role);
}
