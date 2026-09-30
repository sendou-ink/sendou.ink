import type * as React from "react";
import { SendouTabPanel } from "../elements/Tabs";
import { TAB_KEYS } from "./MatchTabs";
import { MatchTimeline, type MatchTimelineProps } from "./MatchTimeline";

export function MatchResultTab({
	children,
	...props
}: MatchTimelineProps & { children?: React.ReactNode }) {
	return (
		<SendouTabPanel id={TAB_KEYS.RESULT}>
			<MatchTimeline {...props} />
			{children}
		</SendouTabPanel>
	);
}
