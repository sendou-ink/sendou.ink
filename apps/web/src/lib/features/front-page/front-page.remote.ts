import { query } from "$app/server";
import * as UserRepository from "#lib/features/user-page/UserRepository.server.ts";

export const getPatrons = query(async () => {
	return UserRepository.findAllPatrons();
});
