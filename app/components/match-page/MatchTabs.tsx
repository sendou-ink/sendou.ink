import {
	BarChart3,
	CalendarClock,
	Key,
	ScrollText,
	Tally5,
	Users,
} from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParam } from "~/modules/search-params/hooks";
import { invariant } from "~/utils/invariant";
import { SendouTab, SendouTabList, SendouTabs } from "../elements/Tabs";
import styles from "./MatchTabs.module.css";
import { matchPageSearchParams } from "./match-page-search-params";

type MatchTabsKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];
interface MatchTabsProps {
	children: React.ReactNode;
	tabs: Array<MatchTabsKey>;
	/** tabs showing a warning-colored alert icon */
	alertTabs?: Array<MatchTabsKey>;
	/** the tab opened without one in the URL; the first one otherwise */
	defaultTab?: MatchTabsKey;
}

export const TAB_KEYS = {
	ROSTERS: "rosters",
	SCHEDULE: "schedule",
	ACTION: "action",
	RESULT: "result",
	STATS: "stats",
	ADMIN: "admin",
} as const;

const TAB_ICONS: Record<MatchTabsKey, React.ReactNode> = {
	rosters: <Users />,
	schedule: <CalendarClock />,
	action: <Tally5 />,
	result: <ScrollText />,
	stats: <BarChart3 />,
	admin: <Key />,
};

const TAB_TRANSLATION_KEYS = {
	rosters: "q:match.tabs.rosters",
	schedule: "q:match.tabs.schedule",
	action: "q:match.tabs.action",
	result: "q:match.tabs.result",
	stats: "q:match.tabs.stats",
	admin: "common:pages.admin",
} as const;

export function MatchTabs({
	children,
	tabs,
	alertTabs,
	defaultTab,
}: MatchTabsProps) {
	const { t } = useTranslation(["q", "common"]);
	const [tabParam, setTab] = useSearchParam(matchPageSearchParams, "tab");

	const currentTab =
		tabs.find((tab) => tabParam === tab) ??
		tabs.find((tab) => tab === defaultTab) ??
		tabs.at(0);
	invariant(currentTab);

	return (
		<div className={styles.root}>
			<SendouTabs
				selectedKey={currentTab}
				onSelectionChange={(key) => setTab(key as MatchTabsKey)}
				disappearing={false}
				padded={false}
			>
				<SendouTabList>
					{tabs.map((tab) => (
						<SendouTab
							key={tab}
							id={tab}
							icon={TAB_ICONS[tab]}
							alert={alertTabs?.includes(tab)}
						>
							{t(TAB_TRANSLATION_KEYS[tab])}
						</SendouTab>
					))}
				</SendouTabList>

				{children}
			</SendouTabs>
		</div>
	);
}
