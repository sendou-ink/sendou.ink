/**
 * The result list chrome shared by the global search and its weapon sub-view:
 * the list box, its items and the empty state shown while there is nothing to
 * list.
 */

import clsx from "clsx";
import type * as React from "react";
import {
	ListBox,
	ListBoxItem,
	type ListBoxItemProps,
	type ListBoxProps,
} from "react-aria-components";
import styles from "./SearchResults.module.css";

export function SearchResultsListBox<T extends object>({
	className,
	ref,
	children,
	...rest
}: ListBoxProps<T> & { ref?: React.Ref<HTMLDivElement> }) {
	return (
		<ListBox {...rest} ref={ref} className={clsx(styles.listBox, className)}>
			{children}
		</ListBox>
	);
}

export function SearchResultsEmptyState({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className={styles.emptyState}>{children}</div>;
}

export function SearchResultsItem(props: ListBoxItemProps) {
	return <ListBoxItem {...props} className={styles.listBoxItem} />;
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
