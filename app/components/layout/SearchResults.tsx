/**
 * The result list chrome shared by the global search and its weapon sub-view:
 * the list box, its items and the empty state shown while there is nothing to
 * list.
 */

import clsx from "clsx";
import * as React from "react";
import { Link } from "react-router";
import styles from "./SearchResults.module.css";

const ListBoxContext = React.createContext<{
	onAction?: (key: string) => void;
}>({});

export function SearchResultsListBox({
	className,
	ref,
	children,
	onAction,
	renderEmptyState,
	autoFocus,
	"aria-label": ariaLabel,
	selectionMode,
}: {
	className?: string;
	ref?: React.Ref<HTMLDivElement>;
	children: React.ReactNode;
	onAction?: (key: string) => void;
	renderEmptyState?: () => React.ReactNode;
	/** Move focus to the first option when the list mounts. */
	autoFocus?: "first";
	"aria-label"?: string;
	selectionMode?: "single" | "none";
}) {
	const localRef = React.useRef<HTMLDivElement | null>(null);

	const options = () => [
		...(localRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ??
			[]),
	];

	const moveFocus = (target: "first" | "last" | "next" | "previous") => {
		const elements = options();
		if (elements.length === 0) return;

		const activeIndex = elements.indexOf(document.activeElement as HTMLElement);
		const targetIndex =
			target === "first"
				? 0
				: target === "last"
					? elements.length - 1
					: target === "next"
						? Math.min(activeIndex + 1, elements.length - 1)
						: Math.max(activeIndex - 1, 0);

		elements[targetIndex].focus();
	};

	const onKeyDown = (event: React.KeyboardEvent) => {
		const direction =
			event.key === "ArrowDown"
				? ("next" as const)
				: event.key === "ArrowUp"
					? ("previous" as const)
					: event.key === "Home"
						? ("first" as const)
						: event.key === "End"
							? ("last" as const)
							: null;
		if (!direction) return;
		event.preventDefault();
		moveFocus(direction);
	};

	const isEmpty = React.Children.count(children) === 0;

	return (
		<div
			ref={(element) => {
				localRef.current = element;
				if (typeof ref === "function") {
					ref(element);
				} else if (ref) {
					ref.current = element;
				}
				if (element && autoFocus === "first") {
					element.querySelector<HTMLElement>('[role="option"]')?.focus();
				}
			}}
			role="listbox"
			aria-label={ariaLabel}
			data-selection-mode={selectionMode}
			tabIndex={0}
			className={clsx(styles.listBox, className)}
			onKeyDown={onKeyDown}
			onFocus={(event) => {
				if (event.target === event.currentTarget) {
					moveFocus("first");
				}
			}}
		>
			<ListBoxContext value={{ onAction }}>
				{isEmpty ? renderEmptyState?.() : children}
			</ListBoxContext>
		</div>
	);
}

export function SearchResultsEmptyState({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className={styles.emptyState}>{children}</div>;
}

export function SearchResultsItem({
	id,
	href,
	textValue,
	children,
}: {
	id: string;
	href?: string;
	textValue?: string;
	children: React.ReactNode;
}) {
	const { onAction } = React.use(ListBoxContext);

	const sharedProps = {
		role: "option",
		tabIndex: -1,
		className: styles.listBoxItem,
		"aria-label": textValue,
		onClick: () => onAction?.(id),
		onKeyDown: href
			? undefined
			: (event: React.KeyboardEvent) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onAction?.(id);
					}
				},
	};

	if (href) {
		return (
			<Link to={href} {...sharedProps}>
				{children}
			</Link>
		);
	}

	return <div {...sharedProps}>{children}</div>;
}

/** the icon + texts row inside one result */
export function SearchResultsItemRow({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className={styles.resultItem}>{children}</div>;
}

export function SearchResultsItemName({
	children,
}: {
	children: React.ReactNode;
}) {
	return <span className={styles.resultName}>{children}</span>;
}
