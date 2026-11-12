import type { Locale } from "#lib/paraglide/runtime.js";
import type { AuthenticatedUser } from "#lib/server/shims/user.server.ts";

declare global {
	namespace App {
		interface Locals {
			user: AuthenticatedUser | undefined;
			locale: Locale;
		}
	}
}
