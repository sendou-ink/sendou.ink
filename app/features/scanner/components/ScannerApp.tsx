/**
 * The scanner's client tree: one container the views' container queries
 * key off, and the view switch. The live capture and a running VoD scan are
 * module singletons (live-session.ts, vod-scan.ts) mounted above this
 * switch, so moving between views never stops them; only leaving the page
 * cancels a scan, while a capture keeps running until Stop.
 */
import { useEffect } from "react";
import { useUser } from "~/features/auth/core/user";
import { useSearchParam } from "~/modules/search-params/hooks";
import { scannerSearchParams } from "../scanner-search-params";
import { deleteVodClips, rollSessionClipsIntoHistory } from "../store/clips";
import { ClipsView } from "./ClipsView";
import { refreshClips } from "./clips-feed";
import { FixturesPage } from "./FixturesPage";
import { LandingView } from "./LandingView";
import { LiveView } from "./LiveView";
import { useLiveSession } from "./live-session";
import { PastSessionView } from "./PastSessionView";
import styles from "./ScannerApp.module.css";
import { ScreenshotPage } from "./ScreenshotPage";
import { setUploadUser } from "./upload";
import { VodView } from "./VodView";
import { cancelVodScan } from "./vod-scan";

/**
 * Once per page load: a file's clips live for one visit (the file is on
 * disk), and session clips left by a capture that never reached Stop (a
 * reload, a closed tab) belong to the history now, not the next capture.
 */
let storeSettled = false;

export function ScannerApp() {
	const [view] = useSearchParam(scannerSearchParams, "view");
	const user = useUser();
	const live = useLiveSession();

	// the controllers run outside React and need the login to decide on uploads
	useEffect(() => {
		setUploadUser(user ? { id: user.id } : null);
	}, [user]);

	useEffect(() => {
		if (storeSettled) return;
		storeSettled = true;
		void Promise.allSettled([
			deleteVodClips(),
			rollSessionClipsIntoHistory(),
		]).then(() => refreshClips());
	}, []);

	// a file scan has no Cancel button: leaving the page is how it is stopped
	useEffect(() => cancelVodScan, []);

	const capturing = live.status === "running" || live.status === "starting";

	const page =
		view === "live" && capturing ? (
			<LiveView />
		) : view === "session" ? (
			<PastSessionView />
		) : view === "vod" ? (
			<VodView />
		) : view === "clips" ? (
			<ClipsView />
		) : view === "debug" ? (
			<ScreenshotPage />
		) : view === "fixtures" && process.env.NODE_ENV === "development" ? (
			<FixturesPage />
		) : (
			<LandingView />
		);

	return <div className={styles.app}>{page}</div>;
}
