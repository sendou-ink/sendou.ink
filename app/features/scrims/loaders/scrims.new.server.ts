import type { LoaderFunctionArgs } from "@remix-run/node";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import { requireUserId } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import * as TeamRepository from "../../team/TeamRepository.server";

export type ScrimsNewLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

	return {
		teams: await TeamRepository.teamsByMemberUserId(user.id),
		associations: await AssociationRepository.findByMemberUserId(user.id),
	};
};
