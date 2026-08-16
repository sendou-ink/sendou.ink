import type { AuthenticatedUser } from "#lib/features/auth/user-types.ts";

declare global {
	namespace App {
		interface Locals {
			user: AuthenticatedUser | undefined;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}
