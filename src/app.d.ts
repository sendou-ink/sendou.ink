// See https://svelte.dev/docs/kit/types#app.d.ts

import type { AuthenticatedUser } from '$lib/server/auth/session';

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: Promise<AuthenticatedUser | undefined>;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
