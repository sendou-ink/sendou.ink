import { Link } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { useSearchParam } from "~/modules/search-params/hooks";
import { CV_PAGE } from "~/utils/urls";
import { CV_TABS, type CvTab, cvSearchParams } from "../cv-search-params";
import { LivePage } from "./LivePage";
import { ScreenshotPage } from "./ScreenshotPage";
import type { SendouUser } from "./sendou-ingest";
import { VodPage } from "./VodPage";
import "./styles.css";

const TAB_LABELS: Record<CvTab, string> = {
	live: "Live",
	screenshot: "Screenshot",
	vod: "VoD",
};

export function App() {
	const [tab] = useSearchParam(cvSearchParams, "tab");
	const rootUser = useUser();
	const sendouUser: SendouUser | null = rootUser
		? { id: rootUser.id, username: rootUser.username }
		: null;

	const page =
		tab === "screenshot" ? (
			<ScreenshotPage />
		) : tab === "vod" ? (
			<VodPage sendouUser={sendouUser} />
		) : (
			<LivePage sendouUser={sendouUser} />
		);

	return (
		<div className="cv-app">
			<header className="topbar">
				<nav>
					{CV_TABS.map((tabOption) => (
						<Link
							key={tabOption}
							to={cvSearchParams.href(CV_PAGE, { tab: tabOption })}
							className={tab === tabOption ? "active" : ""}
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
