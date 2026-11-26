import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import * as React from "react";
import { Link } from "react-router";
import { useHydrated } from "~/hooks/useHydrated";
import { useMainContentWidth } from "~/hooks/useMainContentWidth";
import { useSwipeablePanes } from "~/hooks/useSwipeablePanes";
import { focusMoveForKey, rovingFocusIndex } from "~/utils/roving-focus";

import { ButtonLook } from "./Button";
import styles from "./Tabs.module.css";

type TabsOrientation = "horizontal" | "vertical";

/** Vertical tabs are laid out horizontally below this width, kept in sync with `Tabs.module.css` */
const VERTICAL_TABS_MIN_WIDTH = 720;

interface TabsContextValue {
	selectedKey: string | null;
	orientation: TabsOrientation;
	keepPanelsMounted: boolean;
	swipeable: boolean;
	swipeStripProps: ReturnType<typeof useSwipeablePanes>["stripProps"];
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
	/** Padding above the panels, default true. */
	padded?: boolean;
	/** Hide tabs if only one tab shown, default true. */
	disappearing?: boolean;
	/** Hidden panels stay mounted via `<Activity>`: pre-rendered in the background once the page is idle and state kept across switches, making tab switches instant. Default false. */
	keepPanelsMounted?: boolean;
	/** On narrow screens the panels, wrapped in `SendouTabPanels`, are laid out side by side in a strip swiped between, with the tabs following the swipe. Wider, only the selected panel shows as without it. Implies `keepPanelsMounted`. Default false. */
	swipeable?: boolean;
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
 *
 * @example
 * // swiped between on narrow screens
 * <SendouTabs swipeable>
 *   <SendouTabList>...</SendouTabList>
 *   <SendouTabPanels>
 *     <SendouTabPanel id="shooter">...</SendouTabPanel>
 *     <SendouTabPanel id="roller">...</SendouTabPanel>
 *   </SendouTabPanels>
 * </SendouTabs>
 */
export function SendouTabs({
	selectedKey,
	defaultSelectedKey,
	onSelectionChange,
	padded = true,
	disappearing = true,
	keepPanelsMounted = false,
	swipeable = false,
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

	// the layout switches in CSS so the server render is right already, this only follows it for keyboard and a11y
	const collapsedToHorizontal =
		orientation === "vertical" &&
		mainWidth > 0 &&
		mainWidth < VERTICAL_TABS_MIN_WIDTH;
	const effectiveOrientation = collapsedToHorizontal
		? "horizontal"
		: orientation;

	const selectWithoutScrolling = (key: string) => {
		if (!isControlled) {
			setUncontrolledKey(key);
		}
		onSelectionChange?.(key);
	};

	const swipeablePanes = useSwipeablePanes({
		selectedKey: currentKey,
		onSelectionChange: selectWithoutScrolling,
	});

	const select = swipeable
		? swipeablePanes.scrollToPane
		: selectWithoutScrolling;

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
		keepPanelsMounted: keepPanelsMounted || swipeable,
		swipeable,
		swipeStripProps: swipeablePanes.stripProps,
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

	const tabs = (
		<div
			ref={swipeable ? swipeablePanes.layoutRef : undefined}
			className={clsx(className, styles.root, {
				[styles.swipeable]: swipeable,
				[styles.padded]: padded,
				[styles.disappearing]: disappearing,
				[styles.vertical]: orientation === "vertical",
			})}
		>
			{children}
		</div>
	);

	return (
		<TabsContext value={context}>
			{orientation === "vertical" ? (
				<div className={styles.verticalContainer}>{tabs}</div>
			) : (
				tabs
			)}
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
	if (node.type === SendouTabPanel || node.type === SendouTabPanels) {
		return null;
	}

	return firstTabId((node.props as { children?: React.ReactNode }).children);
}

interface SendouTabProps {
	id: string;
	icon?: React.ReactNode;
	number?: number;
	/** warning-colored alert icon on the tab */
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
				prefetch="intent"
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
	/** tabs share 100% width equally */
	fullWidth?: boolean;
	/** Controls shown at the end of the tab row, outside the tablist itself (horizontal orientation only). */
	actions?: React.ReactNode;
	"aria-label"?: string;
	children: React.ReactNode;
}

export function SendouTabList({
	sticky,
	fullWidth,
	actions,
	"aria-label": ariaLabel,
	children,
}: SendouTabListProps) {
	const tabs = useTabsContext();
	const containerRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container || tabs.orientation === "vertical") return;

		const selectedTab = container.querySelector<HTMLElement>(
			'[role="tab"][aria-selected="true"]',
		);
		if (selectedTab) scrollTabIntoView(container, selectedTab);
	}, [tabs.selectedKey, tabs.orientation]);

	const tabList = (
		<div ref={containerRef} className={styles.tabListContainer}>
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

	if (!actions || tabs.orientation === "vertical") return tabList;

	return (
		<div className={styles.tabListRow}>
			{tabList}
			<div className={styles.tabListActions}>{actions}</div>
		</div>
	);
}

function scrollTabIntoView(container: HTMLElement, tab: HTMLElement) {
	const containerRect = container.getBoundingClientRect();
	const tabRect = tab.getBoundingClientRect();

	if (tabRect.left < containerRect.left) {
		container.scrollLeft -= containerRect.left - tabRect.left;
	} else if (tabRect.right > containerRect.right) {
		container.scrollLeft += tabRect.right - containerRect.right;
	}
}

/** Holds the panels of `swipeable` tabs, the strip swiped between; renders its children as they are otherwise. */
export function SendouTabPanels({ children }: { children: React.ReactNode }) {
	const tabs = useTabsContext();

	if (!tabs.swipeable) return children;

	return (
		<div {...tabs.swipeStripProps} className={styles.swipeStrip}>
			{children}
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
	const isHydrated = useHydrated();

	const selected = tabs.selectedKey === id;
	if (!selected && !tabs.keepPanelsMounted) return null;

	const panel = (
		<div
			className={clsx(className, styles.tabPanel, {
				[styles.swipePane]: tabs.swipeable,
			})}
			role="tabpanel"
			id={`tabpanel-${id}`}
			aria-labelledby={`tab-${id}`}
			data-pane={tabs.swipeable ? id : undefined}
			data-selected={selected ? "true" : undefined}
			inert={tabs.swipeable && !selected}
		>
			{children}
		</div>
	);

	if (!tabs.keepPanelsMounted) return panel;

	// the server can't know where the strip is scrolled to, so the neighbours are revealed only once hydrated
	const isVisible = selected || (tabs.swipeable && isHydrated);

	return (
		<React.Activity mode={isVisible ? "visible" : "hidden"}>
			{panel}
		</React.Activity>
	);
}
