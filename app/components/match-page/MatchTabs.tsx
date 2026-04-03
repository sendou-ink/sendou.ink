import { Tally5, Users } from "lucide-react";
import type * as React from "react";
import { useSearchParams } from "react-router";
import invariant from "~/utils/invariant";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "../elements/Tabs";
import styles from "./MatchTabs.module.css";

type MatchTabsKey = (typeof MATCH_TABS_KEYS)[keyof typeof MATCH_TABS_KEYS];
interface MatchTabsProps {
	children: React.ReactNode;
	tabs: Array<MatchTabsKey>;
}

const TAB_KEY = "tab";

const MATCH_TABS_KEYS = {
	ROSTERS: "rosters",
	ACTION: "action",
} as const;

const ICONS: Record<MatchTabsKey, React.ReactNode> = {
	rosters: <Users />,
	action: <Tally5 />,
};

export function MatchTabs({ children, tabs }: MatchTabsProps) {
	const [searchParams, setSearchParams] = useSearchParams();

	const currentTab =
		tabs.find((tab) => searchParams.get(TAB_KEY) === tab) ?? tabs.at(0);
	invariant(currentTab);

	return (
		<div className={styles.root}>
			<SendouTabs
				selectedKey={currentTab}
				onSelectionChange={(key) =>
					setSearchParams({ [TAB_KEY]: key as string })
				}
			>
				<SendouTabList>
					<SendouTab id={MATCH_TABS_KEYS.ROSTERS} icon={ICONS.rosters}>
						Rosters
					</SendouTab>
					<SendouTab id="action" icon={ICONS.action}>
						Action
					</SendouTab>
				</SendouTabList>

				{children}
			</SendouTabs>
		</div>
	);
}

export function MatchRosterTab() {
	return (
		<SendouTabPanel id={MATCH_TABS_KEYS.ROSTERS}>Roster content</SendouTabPanel>
	);
}

export function MatchActionTab() {
	return (
		<SendouTabPanel id={MATCH_TABS_KEYS.ACTION}>Report content</SendouTabPanel>
	);
}
