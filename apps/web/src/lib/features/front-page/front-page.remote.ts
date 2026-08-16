import * as UserRepository from "#lib/features/user-page/UserRepository.server.ts";
import { query } from "$app/server";

export const getPatrons = query(async () => {
	return UserRepository.findAllPatrons();
});
