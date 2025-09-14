// See https://svelte.dev/docs/kit/types#app.d.ts

import type { TournamentCore } from '$lib/core/tournament/tournament-core';
import type { AuthenticatedUser } from '$lib/server/auth/session';

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user?: Promise<AuthenticatedUser | undefined>;
			tournament?: Record<number, Promise<TournamentCore>>;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
