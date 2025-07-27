import { query } from '$app/server';
import { getUser } from '$lib/server/auth/session';

export const loggedInUser = query(async () => {
	return getUser();
});
