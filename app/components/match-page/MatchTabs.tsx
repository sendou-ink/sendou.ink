import { DoorOpen, ScrollText, Swords, Tally5, Users } from "lucide-react";
import type * as React from "react";
import { useSearchParams } from "react-router";
import invariant from "~/utils/invariant";
import { SendouTab, SendouTabList, SendouTabs } from "../elements/Tabs";
import styles from "./MatchTabs.module.css";

type MatchTabsKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];
interface MatchTabsProps {
	children: React.ReactNode;
	tabs: Array<MatchTabsKey>;
}

const TAB_KEY = "tab";

export const TAB_KEYS = {
	ROSTERS: "rosters",
	PICK_BAN: "pickBan",
	ACTION: "action",
	JOIN: "join",
	RESULT: "result",
} as const;

const TAB_ICONS: Record<MatchTabsKey, React.ReactNode> = {
	rosters: <Users />,
	pickBan: <Swords />, // xxx: use the right icon
	action: <Tally5 />,
	join: <DoorOpen />,
	result: <ScrollText />,
};

const TAB_LABELS: Record<MatchTabsKey, string> = {
	rosters: "Rosters",
	pickBan: "Pick/Ban",
	action: "Action",
	join: "Join",
	result: "Result",
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
				disappearing={false}
			>
				<SendouTabList>
					{tabs.map((tab) => (
						<SendouTab key={tab} id={tab} icon={TAB_ICONS[tab]}>
							{TAB_LABELS[tab]}
						</SendouTab>
					))}
				</SendouTabList>

				{children}
			</SendouTabs>
		</div>
	);
}
