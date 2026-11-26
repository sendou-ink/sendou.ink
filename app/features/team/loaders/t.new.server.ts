import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "../TeamRepository.server";
import { maxTeamCount } from "../team-utils";

export const loader = async () => {
	const user = requireUser();

	const teamCount = await TeamRepository.countByMemberUserId(user.id);

	return { canAddNewTeam: teamCount < maxTeamCount(user) };
};
