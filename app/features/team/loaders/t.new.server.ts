import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "../TeamRepository.server";

export const loader = async () => {
	const user = requireUser();

	const teams = await TeamRepository.findAllMemberOfByUserId(user.id);

	return { teamMemberOfCount: teams.length };
};
