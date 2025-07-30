import { prerender } from '$app/server';
import * as UserRepository from '$lib/server/db/repositories/user';

export const patrons = prerender(async () => {
	return UserRepository.findAllPatrons();
});
