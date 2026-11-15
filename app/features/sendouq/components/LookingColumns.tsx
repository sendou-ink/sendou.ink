import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import {
	SendouTab,
	SendouTabList,
	SendouTabs,
} from "~/components/elements/Tabs";
import { Flipper } from "~/components/Flipper";
import { usePrefersReducedMotion } from "~/hooks/usePrefersReducedMotion";
import styles from "./LookingColumns.module.css";

/**
 * Looking page layout: own group (with the groups it invited below), available groups and received invitations as three columns,
 * collapsing on narrow screens into a strip of full-width panes swiped between with scroll snap, where the invited and available
 * groups share one list. The tabs follow the scroll position and scroll to a pane when clicked. The switch is a container query
 * so the page renders on the server without knowing the screen size.
 */
export function LookingColumns({
	flipKey,
	isFullGroup = false,
	own,
	invited,
	available,
	availableCount,
	received,
	receivedCount,
}: {
	/** Changes whenever the cards might have moved, see `Flipper`. */
	flipKey: unknown;
	/** Picks the challenge wording over the invitation one. */
	isFullGroup?: boolean;
	own: { memberCount: number; content: React.ReactNode } | null;
	/** Groups the own group has invited, `null` when there is no own group to invite with. */
	invited: React.ReactNode | null;
	available: React.ReactNode;
	availableCount: number;
	received: React.ReactNode;
	receivedCount: number;
}) {
	const { t } = useTranslation(["q"]);
	const [selectedPane, setSelectedPane] = React.useState("groups");
	const stripRef = React.useRef<HTMLDivElement>(null);
	const prefersReducedMotion = usePrefersReducedMotion();

	const receivedHeader = t(
		isFullGroup
			? "q:looking.columns.challenges"
			: "q:looking.columns.invitations",
	);

	const scrollToPane = (pane: string) => {
		setSelectedPane(pane);

		const strip = stripRef.current;
		const paneElement = strip?.querySelector(`[data-pane="${pane}"]`);
		if (!strip || !paneElement) return;

		strip.scrollBy({
			left: offsetFromStripStart(strip, paneElement),
			behavior: prefersReducedMotion ? "instant" : "smooth",
		});
	};

	const selectPaneInView = () => {
		const strip = stripRef.current;
		if (!strip) return;

		const paneInView = R.firstBy(
			[...strip.querySelectorAll<HTMLElement>("[data-pane]")],
			(pane) => Math.abs(offsetFromStripStart(strip, pane)),
		);
		if (paneInView?.dataset.pane) setSelectedPane(paneInView.dataset.pane);
	};

	return (
		<div className={styles.layout}>
			<SendouTabs
				selectedKey={selectedPane}
				onSelectionChange={scrollToPane}
				className={styles.tabs}
			>
				<SendouTabList>
					<SendouTab id="groups" number={availableCount}>
						{t("q:looking.columns.groups")}
					</SendouTab>
					<SendouTab id="received" number={receivedCount}>
						{receivedHeader}
					</SendouTab>
					{own ? (
						<SendouTab id="own" number={own.memberCount}>
							{t("q:looking.columns.myGroup")}
						</SendouTab>
					) : null}
				</SendouTabList>
			</SendouTabs>
			<div ref={stripRef} className={styles.strip} onScroll={selectPaneInView}>
				<Flipper flipKey={flipKey} className={styles.columns}>
					{own ? (
						<div className={styles.own} data-pane="own">
							<ColumnHeader>{t("q:looking.columns.myGroup")}</ColumnHeader>
							{own.content}
						</div>
					) : null}
					<div className={styles.groups} data-pane="groups">
						{invited !== null ? (
							<div className={styles.invited}>
								<ColumnHeader>
									{t(
										isFullGroup
											? "q:looking.columns.challenged"
											: "q:looking.columns.invited",
									)}
								</ColumnHeader>
								{invited}
							</div>
						) : null}
						<div className={styles.available}>
							<ColumnHeader>{t("q:looking.columns.available")}</ColumnHeader>
							{available}
						</div>
					</div>
					<div className={styles.received} data-pane="received">
						<ColumnHeader>{receivedHeader}</ColumnHeader>
						{received}
					</div>
				</Flipper>
			</div>
		</div>
	);
}

/** Wraps an invited or available group's card, keeping the sorted order once narrow screens merge the two into one list. */
export function SortedCard({
	sortIndex,
	children,
}: {
	sortIndex: number;
	children: React.ReactNode;
}) {
	return <div style={{ order: sortIndex }}>{children}</div>;
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
	return <div className={styles.header}>{children}</div>;
}

function offsetFromStripStart(strip: HTMLElement, element: Element) {
	return (
		element.getBoundingClientRect().left - strip.getBoundingClientRect().left
	);
}
