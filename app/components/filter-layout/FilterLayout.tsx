import clsx from "clsx";
import {
	ChevronDown,
	ChevronRight,
	RotateCcw,
	SlidersHorizontal,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import { useHydrated } from "~/hooks/useHydrated";
import { SendouBottomSheet } from "../elements/BottomSheet";
import { SendouButton } from "../elements/Button";
import styles from "./FilterLayout.module.css";

export interface FilterLayoutFilter {
	key: string;
	/** Translated filter name shown as the section heading. */
	name: string;
	icon: React.ReactNode;
	/** Translated current value shown next to the name. Null when the filter is at its default. */
	formattedValue: React.ReactNode | null;
	/** One label per active condition for the collapsed summary, defaults to `formattedValue`. */
	activeLabels?: React.ReactNode[];
	/** Section content. Inputs inside write search params directly (instant apply). Rendered once per panel, so ids should come from `useId`. */
	content: React.ReactNode;
	testId?: string;
}

/**
 * Results with their filters: a sidebar next to them when there is room, otherwise a summary
 * button above them opening the same filters in a bottom sheet. Logged out users get only the results.
 */
export function FilterLayout({
	filters,
	onClearAll,
	showResultsText,
	filteredResultsText,
	children,
}: {
	filters: FilterLayoutFilter[];
	/** Resets every filter to its default. Renders the clear all button while filters are active. */
	onClearAll?: () => void;
	/** Label of the button closing the bottom sheet, e.g. "Show builds". */
	showResultsText: string;
	/** Shown above the results while filters are active, e.g. "142 builds". */
	filteredResultsText?: string;
	children: React.ReactNode;
}) {
	const isLoggedIn = Boolean(useUser());
	const activeLabels = filters.flatMap((filter) =>
		filterActiveLabels(filter).map((label, i) => ({
			key: `${filter.key}-${i}`,
			label,
		})),
	);
	const activeCount = activeLabels.length;

	if (!isLoggedIn) {
		return <div className={styles.results}>{children}</div>;
	}

	return (
		<div className={styles.container}>
			<div className={styles.layout}>
				<div className={styles.mobileOnly}>
					<FilterSheet
						filters={filters}
						activeLabels={activeLabels}
						onClearAll={activeCount > 0 ? onClearAll : undefined}
						showResultsText={showResultsText}
					/>
				</div>
				<aside
					className={clsx(styles.sidebar, styles.desktopOnly, "scrollbar")}
				>
					<PanelHeader
						activeCount={activeCount}
						onClearAll={activeCount > 0 ? onClearAll : undefined}
					/>
					{filters.map((filter) => (
						<FilterSection key={filter.key} filter={filter} collapsible />
					))}
				</aside>
				<div className={styles.results}>
					{activeCount > 0 && filteredResultsText ? (
						<div
							className={styles.filteredResultsText}
							data-testid="filtered-results-text"
						>
							{filteredResultsText}
						</div>
					) : null}
					{children}
				</div>
			</div>
		</div>
	);
}

function FilterSheet({
	filters,
	activeLabels,
	onClearAll,
	showResultsText,
}: {
	filters: FilterLayoutFilter[];
	activeLabels: Array<{ key: string; label: React.ReactNode }>;
	onClearAll?: () => void;
	showResultsText: string;
}) {
	const { t } = useTranslation(["common"]);
	const sheetId = React.useId();
	// the sheet's content mounts on open, so a press before hydration would show it empty
	const isHydrated = useHydrated();

	const trigger = (
		<button
			type="button"
			className={styles.sheetTrigger}
			data-testid="filters-sheet-button"
		>
			<SlidersHorizontal className={styles.sheetTriggerIcon} />
			<span className={styles.sheetTriggerTexts}>
				<span className={styles.sheetTriggerTitle}>
					{t("common:filterLayout.filters")}
					{activeLabels.length > 0 ? (
						<CountBadge count={activeLabels.length} />
					) : null}
				</span>
				{activeLabels.length > 0 ? (
					<span className={styles.sheetTriggerSummary}>
						{activeLabels.map(({ key, label }, i) => (
							<React.Fragment key={key}>
								{i > 0 ? " · " : null}
								{label}
							</React.Fragment>
						))}
					</span>
				) : null}
			</span>
			<ChevronRight className={styles.sheetTriggerChevron} />
		</button>
	);

	return (
		<>
			{React.cloneElement(trigger, {
				popoverTarget: isHydrated ? sheetId : undefined,
			})}
			<SendouBottomSheet
				id={sheetId}
				title={t("common:filterLayout.filters")}
				icon={<SlidersHorizontal size={18} />}
				headerActions={
					<>
						{activeLabels.length > 0 ? (
							<CountBadge count={activeLabels.length} />
						) : null}
						{onClearAll ? (
							<ClearAllButton className="ml-auto" onClick={onClearAll} />
						) : null}
					</>
				}
				footer={
					<SendouButton
						className="w-full"
						popoverTarget={sheetId}
						popoverTargetAction="hide"
					>
						{showResultsText}
					</SendouButton>
				}
			>
				<div className={styles.sheetBody}>
					{filters.map((filter) => (
						<FilterSection key={filter.key} filter={filter} />
					))}
				</div>
			</SendouBottomSheet>
		</>
	);
}

function PanelHeader({
	activeCount,
	onClearAll,
}: {
	activeCount: number;
	onClearAll?: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={styles.panelHeader}>
			<SlidersHorizontal className={styles.accentIcon} />
			<h2 className={styles.panelTitle}>{t("common:filterLayout.filters")}</h2>
			{activeCount > 0 ? <CountBadge count={activeCount} /> : null}
			{onClearAll ? (
				<ClearAllButton className="ml-auto" onClick={onClearAll} />
			) : null}
		</div>
	);
}

function ClearAllButton({
	className,
	onClick,
}: {
	className?: string;
	onClick: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			className={className}
			variant="minimal"
			size="small"
			icon={<RotateCcw />}
			onClick={onClick}
			data-testid="clear-all-filters"
		>
			{t("common:filterLayout.clearAll")}
		</SendouButton>
	);
}

function FilterSection({
	filter,
	collapsible,
}: {
	filter: FilterLayoutFilter;
	collapsible?: boolean;
}) {
	const heading = (
		<>
			{collapsible ? (
				<span className={styles.sectionIcon}>{filter.icon}</span>
			) : null}
			<span>{filter.name}</span>
			{filter.formattedValue !== null ? (
				<span className={styles.sectionValue}>{filter.formattedValue}</span>
			) : null}
		</>
	);

	if (!collapsible) {
		return (
			<section className={styles.section} data-testid={filter.testId}>
				<h3 className={styles.sectionHeading}>{heading}</h3>
				{filter.content}
			</section>
		);
	}

	return (
		<details
			className={styles.collapsibleSection}
			data-testid={filter.testId}
			open
		>
			<summary className={styles.sectionSummary}>
				{heading}
				<ChevronDown className={styles.sectionChevron} />
			</summary>
			<div className={styles.sectionContent}>{filter.content}</div>
		</details>
	);
}

function CountBadge({ count }: { count: number }) {
	return <span className={styles.countBadge}>{count}</span>;
}

function filterActiveLabels(filter: FilterLayoutFilter) {
	if (filter.activeLabels) return filter.activeLabels;

	return filter.formattedValue !== null ? [filter.formattedValue] : [];
}
