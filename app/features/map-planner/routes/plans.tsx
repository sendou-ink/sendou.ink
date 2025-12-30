import { lazy } from "react";
import type { MetaFunction } from "react-router";
import { Placeholder } from "~/components/Placeholder";
import { useIsMounted } from "~/hooks/useIsMounted";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, PLANNER_URL } from "~/utils/urls";

import "../plans.css";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Map Planner",
		ogTitle: "Splatoon 3 Map planner",
		description:
			"Make perfect Splatoon 3 battle plans by drawing on maps and adding weapon images",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons"],
	breadcrumb: () => ({
		imgPath: navIconUrl("plans"),
		href: PLANNER_URL,
		type: "IMAGE",
	}),
};

const Planner = lazy(() => import("~/features/map-planner/components/Planner"));

export default function MapPlannerPage() {
	const isMounted = useIsMounted();

	if (!isMounted) return <Placeholder />;

	return <Planner />;
}
