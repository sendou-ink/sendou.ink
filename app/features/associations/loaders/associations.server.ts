import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireUserId } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import * as AssociationRepository from "../AssociationRepository.server";

export type AssociationsLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

	return {
		associations: (await AssociationRepository.findByMemberUserId(user.id))
			.actual,
	};
};
