import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
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
import { useMainContentWidth } from "~/hooks/useMainContentWidth";

import { ButtonLook } from "./Button";
import styles from "./Tabs.module.css";

interface SendouTabsProps extends TabsProps {
	/** Padding above the panels, default true. */
	padded?: boolean;
	/** Hide tabs if only one tab shown, default true. */
	disappearing?: boolean;
	/** Vertical orientation switches to horizontal below this main content width (px). */
	horizontalBelow?: number;
}

/** Wrapper around react-aria `Tabs`, see https://react-spectrum.adobe.com/react-aria/Tabs.html */
export function SendouTabs({
	padded = true,
	disappearing = true,
	horizontalBelow,
	className,
	orientation,
	onSelectionChange,
	...rest
}: SendouTabsProps) {
	const mainWidth = useMainContentWidth();
	const collapsedToHorizontal =
		orientation === "vertical" &&
		typeof horizontalBelow === "number" &&
		mainWidth > 0 &&
		mainWidth < horizontalBelow;
	const effectiveOrientation = collapsedToHorizontal
		? "horizontal"
		: orientation;
	const isVertical = effectiveOrientation === "vertical";

	return (
		<Tabs
			orientation={effectiveOrientation}
			onSelectionChange={onSelectionChange}
			className={clsx(className, styles.root, {
				[styles.padded]: padded,
				[styles.disappearing]: disappearing,
				[styles.vertical]: isVertical,
			})}
			{...rest}
		/>
	);
}

interface SendouTabProps extends TabProps {
	icon?: React.ReactNode;
	number?: number;
	/** warning-colored alert icon on the tab */
	alert?: boolean;
	children?: React.ReactNode;
}

export function SendouTab({
	icon,
	children,
	number,
	alert,
	...rest
}: SendouTabProps) {
	return (
		<Tab className={styles.tabContainer} {...rest}>
			<ButtonLook className={styles.tabButton}>
				{icon}
				{children}
				{typeof number === "number" && number !== 0 && (
					<span className={styles.tabNumber}>{number}</span>
				)}
				{alert ? <TriangleAlert className={styles.tabAlert} /> : null}
			</ButtonLook>
		</Tab>
	);
}

interface SendouTabListProps<T extends object> extends TabListProps<T> {
	sticky?: boolean;
	/** tabs share 100% width equally */
	fullWidth?: boolean;
}

export function SendouTabList<T extends object>({
	sticky,
	fullWidth,
	...rest
}: SendouTabListProps<T>) {
	return (
		<div className={clsx(styles.tabListContainer, "scrollbar")}>
			<TabList
				className={clsx(styles.tabList, {
					[styles.sticky]: sticky,
					[styles.fullWidth]: fullWidth,
				})}
				{...rest}
			/>
		</div>
	);
}

interface SendouTabPanelProps extends TabPanelProps {
	className?: string;
}

export function SendouTabPanel({ className, ...rest }: SendouTabPanelProps) {
	return <TabPanel className={clsx(className, styles.tabPanel)} {...rest} />;
}
