import type { LoaderFunctionArgs } from "@remix-run/node";
import * as AssociationRepository from "~/features/associations/AssociationRepository.server";
import { requireUserId } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import { notFoundIfFalsy } from "~/utils/remix.server";
import * as TeamRepository from "../../team/TeamRepository.server";
import { FF_SCRIMS_ENABLED } from "../scrims-constants";

export type ScrimsNewLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	notFoundIfFalsy(FF_SCRIMS_ENABLED);

	const user = await requireUserId(request);

	return {
		teams: await TeamRepository.teamsByMemberUserId(user.id),
		associations: await AssociationRepository.findByMemberUserId(user.id),
	};
};
