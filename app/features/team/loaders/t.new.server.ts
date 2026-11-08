import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "../TeamRepository.server";
import { maxTeamCount } from "../team-utils";

export const loader = async () => {
	const user = requireUser();

	const teams = await TeamRepository.findAllMemberOfByUserId(user.id);

	return { canAddNewTeam: teams.length < maxTeamCount(user) };
};
