import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import * as BadgeRepository from "../BadgeRepository.server";

export type BadgeDetailsLoaderData = SerializeFrom<typeof loader>;
export const loader = async ({ params }: LoaderFunctionArgs) => {
	const badgeId = Number(params.id);
	if (Number.isNaN(badgeId)) {
		throw new Response(null, { status: 404 });
	}

	return {
		owners: await BadgeRepository.findOwnersByBadgeId(badgeId),
		managers: await BadgeRepository.findManagersByBadgeId(badgeId),
	};
};
