import type { MetaFunction } from "@remix-run/node";
import { lazy } from "react";
import { useIsMounted } from "~/hooks/useIsMounted";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { PLANNER_URL, navIconUrl } from "~/utils/urls";

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

	if (!isMounted) return <div className="plans__placeholder" />;

	return <Planner />;
}
