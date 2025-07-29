import { query } from '$app/server';
import { getUser } from '$lib/server/auth/session';

export const me = query(async () => {
	return getUser();
});
