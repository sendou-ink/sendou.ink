import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "../TeamRepository.server";

export const loader = async () => {
	const user = requireUser();

	return {
		teamMemberOfCount: await TeamRepository.teams().forMember(user.id).count(),
	};
};
