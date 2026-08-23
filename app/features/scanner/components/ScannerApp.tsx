import clsx from "clsx";
import { Link } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { useSearchParam } from "~/modules/search-params/hooks";
import { SCANNER_PAGE } from "~/utils/urls";
import {
	SCANNER_TABS,
	type ScannerTab,
	scannerSearchParams,
} from "../scanner-search-params";
import { FixturesPage } from "./FixturesPage";
import { LivePage } from "./LivePage";
import styles from "./ScannerApp.module.css";
import { ScreenshotPage } from "./ScreenshotPage";
import type { SendouUser } from "./sendou-ingest";
import { VodPage } from "./VodPage";

const TAB_LABELS: Record<ScannerTab, string> = {
	live: "Live",
	screenshot: "Screenshot",
	vod: "VoD",
	fixtures: "Fixtures",
};

// the fixtures tab reads the corpus off disk, which only a dev checkout has
const visibleTabs =
	process.env.NODE_ENV === "development"
		? SCANNER_TABS
		: SCANNER_TABS.filter((tab) => tab !== "fixtures");

export function ScannerApp() {
	const [tab] = useSearchParam(scannerSearchParams, "tab");
	const rootUser = useUser();
	const sendouUser: SendouUser | null = rootUser
		? { id: rootUser.id, username: rootUser.username }
		: null;

	const page =
		tab === "screenshot" ? (
			<ScreenshotPage />
		) : tab === "vod" ? (
			<VodPage sendouUser={sendouUser} />
		) : tab === "fixtures" && process.env.NODE_ENV === "development" ? (
			<FixturesPage />
		) : (
			<LivePage sendouUser={sendouUser} />
		);

	return (
		<div className={styles.app}>
			<header className={styles.topbar}>
				<nav>
					{visibleTabs.map((tabOption) => (
						<Link
							key={tabOption}
							to={scannerSearchParams.href(SCANNER_PAGE, { tab: tabOption })}
							className={clsx({ [styles.active]: tab === tabOption })}
						>
							{TAB_LABELS[tabOption]}
						</Link>
					))}
				</nav>
			</header>
			{page}
		</div>
	);
}
