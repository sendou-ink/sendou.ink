import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import * as React from "react";
import { Link } from "react-router";
import { useMainContentWidth } from "~/hooks/useMainContentWidth";
import { focusMoveForKey, rovingFocusIndex } from "~/utils/roving-focus";

import { ButtonLook } from "./Button";
import styles from "./Tabs.module.css";

type TabsOrientation = "horizontal" | "vertical";

interface TabsContextValue {
	selectedKey: string | null;
	orientation: TabsOrientation;
	select: (key: string) => void;
	registerTab: (key: string, element: HTMLElement) => () => void;
	moveFocus: (
		fromKey: string,
		direction: "next" | "previous" | "first" | "last",
	) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
	const context = React.use(TabsContext);
	if (!context) throw new Error("Tabs components must be inside SendouTabs");
	return context;
}

interface SendouTabsProps {
	selectedKey?: string | null;
	defaultSelectedKey?: string;
	onSelectionChange?: (key: string) => void;
	orientation?: TabsOrientation;
	/** Should there be padding above the panels. Defaults to true, pass in false if the panel content is managing its own padding. */
	padded?: boolean;
	/** Hide tabs if only one tab shown? Defaults to true. */
	disappearing?: boolean;
	/** When orientation is "vertical", switch to horizontal once the main content width drops below this many pixels. */
	horizontalBelow?: number;
	className?: string;
	children: React.ReactNode;
}

/**
 * Renders a set of accessible tabs.
 *
 * @example
 * <SendouTabs>
 *   <SendouTabList>
 *     <SendouTab id="shooter">Shooter</SendouTab>
 *     <SendouTab id="roller">Roller</SendouTab>
 *   </SendouTabList>
 *   <SendouTabPanel id="shooter">
 *     Splattershot, Aerospray, etc.
 *   </SendouTabPanel>
 *   <SendouTabPanel id="roller">
 *     Splat Roller, Dynamo Roller, etc.
 *   </SendouTabPanel>
 * </SendouTabs>
 */
export function SendouTabs({
	selectedKey,
	defaultSelectedKey,
	onSelectionChange,
	padded = true,
	disappearing = true,
	horizontalBelow,
	className,
	orientation = "horizontal",
	children,
}: SendouTabsProps) {
	const mainWidth = useMainContentWidth();

	const [isControlled] = React.useState(selectedKey !== undefined);
	// resolved during render so the first panel is server rendered
	const [uncontrolledKey, setUncontrolledKey] = React.useState<string | null>(
		() => defaultSelectedKey ?? firstTabId(children),
	);
	const currentKey = isControlled ? (selectedKey ?? null) : uncontrolledKey;

	const tabsRef = React.useRef(new Map<string, HTMLElement>());

	const collapsedToHorizontal =
		orientation === "vertical" &&
		typeof horizontalBelow === "number" &&
		mainWidth > 0 &&
		mainWidth < horizontalBelow;
	const effectiveOrientation = collapsedToHorizontal
		? "horizontal"
		: orientation;
	const isVertical = effectiveOrientation === "vertical";

	const select = (key: string) => {
		if (!isControlled) {
			setUncontrolledKey(key);
		}
		onSelectionChange?.(key);
	};

	const orderedKeys = () =>
		[...tabsRef.current.entries()]
			.sort(([, a], [, b]) =>
				a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
					? -1
					: 1,
			)
			.map(([key]) => key);

	const context: TabsContextValue = {
		selectedKey: currentKey,
		orientation: effectiveOrientation,
		select,
		registerTab: (key, element) => {
			tabsRef.current.set(key, element);
			if (!isControlled) {
				setUncontrolledKey((current) => current ?? key);
			}
			return () => {
				tabsRef.current.delete(key);
			};
		},
		moveFocus: (fromKey, direction) => {
			const keys = orderedKeys();
			if (keys.length === 0) return;

			const targetKey =
				keys[
					rovingFocusIndex(direction, keys.indexOf(fromKey), keys.length, {
						wrap: true,
					})
				];
			tabsRef.current.get(targetKey)?.focus();
			select(targetKey);
		},
	};

	return (
		<TabsContext value={context}>
			<div
				className={clsx(className, styles.root, {
					[styles.padded]: padded,
					[styles.disappearing]: disappearing,
					[styles.vertical]: isVertical,
				})}
			>
				{children}
			</div>
		</TabsContext>
	);
}

/** Id of the first enabled `SendouTab` in the tree, the default selection; tabs behind other components stay unseen and register on mount instead. */
function firstTabId(node: React.ReactNode): string | null {
	if (Array.isArray(node)) {
		for (const child of node) {
			const id = firstTabId(child);
			if (id !== null) return id;
		}
		return null;
	}
	if (!React.isValidElement(node)) return null;

	if (node.type === SendouTab) {
		const props = node.props as SendouTabProps;
		return props.isDisabled ? null : props.id;
	}
	if (node.type === SendouTabPanel) return null;

	return firstTabId((node.props as { children?: React.ReactNode }).children);
}

interface SendouTabProps {
	id: string;
	icon?: React.ReactNode;
	number?: number;
	/** Render a warning-colored alert icon to draw attention to this tab. */
	alert?: boolean;
	isDisabled?: boolean;
	href?: string;
	routerOptions?: { preventScrollReset?: boolean };
	"data-testid"?: string;
	children?: React.ReactNode;
}

export function SendouTab({
	id,
	icon,
	children,
	number,
	alert,
	isDisabled,
	href,
	routerOptions,
	"data-testid": testId,
}: SendouTabProps) {
	const tabs = useTabsContext();

	const selected = tabs.selectedKey === id;

	const onKeyDown = (event: React.KeyboardEvent) => {
		const move = focusMoveForKey(event.key, tabs.orientation);
		if (!move) return;

		event.preventDefault();
		tabs.moveFocus(id, move);
	};

	const register = (element: HTMLElement | null) => {
		if (!element || isDisabled) return;
		return tabs.registerTab(id, element);
	};

	const sharedProps = {
		role: "tab",
		id: `tab-${id}`,
		"aria-selected": selected,
		"aria-controls": `tabpanel-${id}`,
		"aria-disabled": isDisabled || undefined,
		tabIndex: selected ? 0 : -1,
		"data-selected": selected ? "true" : undefined,
		"data-testid": testId,
		className: clsx(styles.tabContainer, {
			[styles.tabDisabled]: isDisabled,
		}),
		onKeyDown,
	};

	const content = (
		<ButtonLook className={styles.tabButton}>
			{icon}
			{children}
			{typeof number === "number" && number !== 0 ? (
				<span className={styles.tabNumber}>{number}</span>
			) : null}
			{alert ? <TriangleAlert className={styles.tabAlert} /> : null}
		</ButtonLook>
	);

	if (href && !isDisabled) {
		return (
			<Link
				to={href}
				preventScrollReset={routerOptions?.preventScrollReset}
				ref={register}
				{...sharedProps}
				onClick={() => tabs.select(id)}
			>
				{content}
			</Link>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: role=tab with roving-focus keyboard handling
		<div
			ref={register}
			{...sharedProps}
			onClick={() => {
				if (!isDisabled) tabs.select(id);
			}}
		>
			{content}
		</div>
	);
}

interface SendouTabListProps {
	sticky?: boolean;
	/** Should tabs take 100% width with equal distribution? */
	fullWidth?: boolean;
	"aria-label"?: string;
	children: React.ReactNode;
}

export function SendouTabList({
	sticky,
	fullWidth,
	"aria-label": ariaLabel,
	children,
}: SendouTabListProps) {
	const tabs = useTabsContext();

	return (
		<div className={clsx(styles.tabListContainer, "scrollbar")}>
			<div
				className={clsx(styles.tabList, {
					[styles.sticky]: sticky,
					[styles.fullWidth]: fullWidth,
				})}
				role="tablist"
				aria-label={ariaLabel}
				aria-orientation={tabs.orientation}
			>
				{children}
			</div>
		</div>
	);
}

interface SendouTabPanelProps {
	id: string;
	className?: string;
	children?: React.ReactNode;
}

export function SendouTabPanel({
	id,
	className,
	children,
}: SendouTabPanelProps) {
	const tabs = useTabsContext();

	if (tabs.selectedKey !== id) return null;

	return (
		<div
			className={clsx(className, styles.tabPanel)}
			role="tabpanel"
			id={`tabpanel-${id}`}
			aria-labelledby={`tab-${id}`}
		>
			{children}
		</div>
	);
}
