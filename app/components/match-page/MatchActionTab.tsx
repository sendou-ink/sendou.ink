import { SendouTabPanel } from "../elements/Tabs";
import { TAB_KEYS } from "./MatchTabs";

export function MatchActionTab() {
	return <SendouTabPanel id={TAB_KEYS.ACTION}>Report content</SendouTabPanel>;
}
