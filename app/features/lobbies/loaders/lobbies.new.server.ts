import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { requireRole } from "~/modules/permissions/guards.server";

export const loader = async () => {
	const user = requireUser();
	requireRole("LOBBY_ADDER");

	return {
		associations: await AssociationRepository.findByMemberUserId(user.id),
		hasFriendCode: Boolean(
			await UserRepository.findCurrentFriendCodeByUserId(user.id),
		),
	};
};
