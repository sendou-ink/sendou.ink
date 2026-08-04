import { lazy } from "react";
import type { MetaFunction } from "react-router";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { useHydrated } from "~/hooks/useHydrated";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";

// `builds` powers the empty/UNKNOWN ability label in <Ability />; the weapon
// and game-misc namespaces the CV cards rely on are always loaded.
export const handle: SendouRouteHandle = {
	i18n: ["builds"],
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "CV",
		description:
			"Detect Splatoon 3 match events (scoreboards, deaths, map screens) from live OBS footage, VoDs, and screenshots",
		location: args.location,
	});
};

// Everything below the shell assumes a browser: the OpenCV.js worker,
// IndexedDB, WebCodecs, getUserMedia. Nothing from core/worker/capture/store
// may be imported at route-module top level — only from inside this lazily
// imported client component tree, after hydration.
const CvApp = lazy(() =>
	import("~/features/cv/components/App").then((m) => ({ default: m.App })),
);

export default function CvPage() {
	const isHydrated = useHydrated();

	return <Main bigger>{isHydrated ? <CvApp /> : <Placeholder />}</Main>;
}
