import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import { requireUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import * as TeamRepository from "../../team/TeamRepository.server";

export type ScrimsNewLoaderData = SerializeFrom<typeof loader>;

export const loader = async () => {
	const user = await requireUser();

	return {
		teams: await TeamRepository.teamsByMemberUserId(user.id),
		associations: await AssociationRepository.findByMemberUserId(user.id),
	};
};
