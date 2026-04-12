import { SendouTabPanel } from "../elements/Tabs";
import { TAB_KEYS } from "./MatchTabs";
import { MatchTimeline, type MatchTimelineProps } from "./MatchTimeline";

export function MatchResultTab(props: MatchTimelineProps) {
	return (
		<SendouTabPanel id={TAB_KEYS.RESULT}>
			<MatchTimeline {...props} />
		</SendouTabPanel>
	);
}
