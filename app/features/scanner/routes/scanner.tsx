import { lazy } from "react";
import type { MetaFunction } from "react-router";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { useHydrated } from "~/hooks/useHydrated";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";

// `builds` powers the empty/UNKNOWN ability label in <Ability />; the weapon
// and game-misc namespaces the scanner cards rely on are always loaded.
export const handle: SendouRouteHandle = {
	i18n: ["builds"],
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Scanner",
		description:
			"Keep it running while you play: reads your Splatoon 3 games off a capture card or a VoD, uploads the results to sendou.ink and clips your best moments",
		location: args.location,
	});
};

// Everything below the shell assumes a browser (OpenCV.js worker, IndexedDB,
// WebCodecs, getUserMedia): nothing from core/worker/capture/store may be
// imported at route-module top level — only inside this lazy client tree.
const ScannerApp = lazy(() =>
	import("~/features/scanner/components/ScannerApp").then((m) => ({
		default: m.ScannerApp,
	})),
);

export default function ScannerPage() {
	const isHydrated = useHydrated();

	return <Main bigger>{isHydrated ? <ScannerApp /> : <Placeholder />}</Main>;
}
