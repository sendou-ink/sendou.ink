import { requireUser } from "~/features/auth/core/user.server";
import * as TeamRepository from "../TeamRepository.server";

export const loader = async () => {
	const user = requireUser();

	const teams = await TeamRepository.findAllUndisbanded();
	const teamMemberOfCount = teams.filter((team) =>
		team.members.some((m) => m.id === user.id),
	).length;

	return { teamMemberOfCount };
};
