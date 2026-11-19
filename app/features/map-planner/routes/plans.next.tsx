import { lazy } from "react";
import type { MetaFunction } from "react-router";
import { Placeholder } from "~/components/Placeholder";
import { useHydrated } from "~/hooks/useHydrated";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, PLANNER_URL } from "~/utils/urls";

// XXX: serve the new planner at /plans in place of the tldraw one (last step of the map planner epic)

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Map Planner",
		ogTitle: "Splatoon 3 Map planner",
		description:
			"Plan Splatoon 3 battles on the map with both teams' weapons, ranges and drawings",
		image: ogPageImage("plans"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	breadcrumb: () => ({
		imgPath: navIconUrl("plans"),
		href: PLANNER_URL,
		type: "IMAGE",
	}),
};

const MapPlanner = lazy(() =>
	import("~/features/map-planner/components/MapPlanner").then((module) => ({
		default: module.MapPlanner,
	})),
);

export default function MapPlannerNextPage() {
	const isHydrated = useHydrated();

	if (!isHydrated) return <Placeholder />;

	return <MapPlanner />;
}
