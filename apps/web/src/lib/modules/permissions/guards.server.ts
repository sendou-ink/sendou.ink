import { error } from "@sveltejs/kit";
import { getUser } from "#lib/features/auth/user.server.ts";
import type { Role } from "./types.ts";

/** Responds with 403 unless the logged in user has the given role. */
export function requireRole(role: Role) {
	const user = getUser();

	if (!user?.roles.includes(role)) {
		error(403, "Forbidden");
	}
}
