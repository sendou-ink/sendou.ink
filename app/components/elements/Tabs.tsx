import clsx from "clsx";
import {
	Tab,
	TabList,
	type TabListProps,
	TabPanel,
	type TabPanelProps,
	type TabProps,
	Tabs,
	type TabsProps,
} from "react-aria-components";

import buttonStyles from "./Button.module.css";
import styles from "./Tabs.module.css";

interface SendouTabsProps extends TabsProps {
	/** Should there be padding above the panels. Defaults to true, pass in false if the panel content is managing its own padding. */
	padded?: boolean;
	/** Hide tabs if only one tab shown? Defaults to true. */
	disappearing?: boolean;
}

/**
 * Renders a set of accessible tabs using the provided props.
 *
 * This component is a wrapper around the `Tabs` component, forwarding all props.
 *
 * @param props - The properties to pass to the underlying `Tabs` component.
 * @returns The rendered tab interface.
 *
 * @url https://react-spectrum.adobe.com/react-aria/Tabs.html
 *
 * @example
 * <SendouTabs>
 *   <SendouTabList>
 *     <Tab id="shooter">Shooter</Tab>
 *     <Tab id="roller">Roller</Tab>
 *     <Tab id="charger">Charger</Tab>
 *   </SendouTabList>
 *   <SendouTabPanel id="shooter">
 *     Splattershot, Aerospray, etc.
 *   </SendouTabPanel>
 *   <SendouTabPanel id="roller">
 *     Splat Roller, Dynamo Roller, etc.
 *   </SendouTabPanel>
 *   <SendouTabPanel id="charger">
 *     Splat Charger, E-liter, etc.
 *   </SendouTabPanel>
 * </SendouTabs>
 */
export function SendouTabs({
	padded = true,
	disappearing = true,
	className,
	...rest
}: SendouTabsProps) {
	return (
		<Tabs
			className={clsx(className, {
				[styles.padded]: padded,
				[styles.disappearing]: disappearing,
			})}
			{...rest}
		/>
	);
}

interface SendouTabProps extends TabProps {
	icon?: React.ReactNode;
	number?: number;
	children?: React.ReactNode;
}

export function SendouTab({ icon, children, number, ...rest }: SendouTabProps) {
	return (
		<Tab className={clsx(buttonStyles.button, styles.tabButton)} {...rest}>
			{icon}
			{children}
			{typeof number === "number" && number !== 0 && (
				<span className={styles.tabNumber}>{number}</span>
			)}
		</Tab>
	);
}

interface SendouTabListProps<T extends object> extends TabListProps<T> {
	/** Should overflow-x: auto CSS rule be applied? Defaults to true */
	scrolling?: boolean;
	sticky?: boolean;
}

export function SendouTabList<T extends object>({
	scrolling = true,
	sticky,
	...rest
}: SendouTabListProps<T>) {
	return (
		<TabList
			className={clsx(styles.tabList, {
				"overflow-x-auto": scrolling,
				// invisible: cantSwitchTabs && !disappearing,
				// hidden: cantSwitchTabs && disappearing,
				[styles.sticky]: sticky,
			})}
			{...rest}
		/>
	);
}

interface SendouTabPanelProps extends TabPanelProps {
	className?: string;
}

export function SendouTabPanel({ className, ...rest }: SendouTabPanelProps) {
	return <TabPanel className={clsx(className, styles.tabPanel)} {...rest} />;
}
