import { useLoaderData, useMatches } from "@remix-run/react";
import { VodListing } from "~/features/vods/components/VodListing";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";

import { loader } from "../loaders/u.$identifier.vods.server";
export { loader };

import "~/features/vods/vods.css";

export const handle: SendouRouteHandle = {
	i18n: ["vods"],
};

export default function UserVodsPage() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="vods__listing__list">
			{data.vods.map((vod) => (
				<VodListing key={vod.id} vod={vod} showUser={false} />
			))}
		</div>
	);
}
