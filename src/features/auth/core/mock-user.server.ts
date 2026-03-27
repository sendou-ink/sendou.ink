import * as UserRepository from "~/features/user-page/UserRepository.server";

const ADMIN_USER_ID = 274;

export async function getMockUser() {
	return UserRepository.findLeanById(ADMIN_USER_ID);
}
