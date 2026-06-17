import { BarChart3, Key, ScrollText, Tally5, Users } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import invariant from "~/utils/invariant";
import { SendouTab, SendouTabList, SendouTabs } from "../elements/Tabs";
import styles from "./MatchTabs.module.css";

type MatchTabsKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];
interface MatchTabsProps {
	children: React.ReactNode;
	tabs: Array<MatchTabsKey>;
	/** Tabs that should show a warning-colored alert icon to draw attention. */
	alertTabs?: Array<MatchTabsKey>;
}

const TAB_KEY = "tab";

export const TAB_KEYS = {
	ROSTERS: "rosters",
	ACTION: "action",
	RESULT: "result",
	STATS: "stats",
	ADMIN: "admin",
} as const;

const TAB_ICONS: Record<MatchTabsKey, React.ReactNode> = {
	rosters: <Users />,
	action: <Tally5 />,
	result: <ScrollText />,
	stats: <BarChart3 />,
	admin: <Key />,
};

const TAB_TRANSLATION_KEYS = {
	rosters: "q:match.tabs.rosters",
	action: "q:match.tabs.action",
	result: "q:match.tabs.result",
	stats: "q:match.tabs.stats",
	admin: "common:pages.admin",
} as const;

export function MatchTabs({ children, tabs, alertTabs }: MatchTabsProps) {
	const { t } = useTranslation(["q", "common"]);
	const [searchParams, setSearchParams] = useSearchParams();

	const currentTab =
		tabs.find((tab) => searchParams.get(TAB_KEY) === tab) ?? tabs.at(0);
	invariant(currentTab);

	return (
		<div className={styles.root}>
			<SendouTabs
				selectedKey={currentTab}
				onSelectionChange={(key) =>
					setSearchParams(
						{ [TAB_KEY]: key as string },
						{
							preventScrollReset: true,
							defaultShouldRevalidate: false,
							replace: true,
						},
					)
				}
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
