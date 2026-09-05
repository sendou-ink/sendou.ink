import { lazy } from "react";
import type { MetaFunction } from "react-router";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { Redirect } from "~/components/Redirect";
import { Config } from "~/config";
import { useHydrated } from "~/hooks/useHydrated";
import { useHasRole } from "~/modules/permissions/hooks";
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
			"Detect Splatoon 3 match events (scoreboards, deaths, map screens) from live OBS footage, VoDs, and screenshots",
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
	const isAdmin = useHasRole("ADMIN");
	const isDev = useHasRole("DEV");
	const isScannerTester = useHasRole("SCANNER_TESTER");

	if (!Config.scannerEnabled && !isAdmin && !isDev && !isScannerTester) {
		return <Redirect to="/" />;
	}

	return <Main bigger>{isHydrated ? <ScannerApp /> : <Placeholder />}</Main>;
}
