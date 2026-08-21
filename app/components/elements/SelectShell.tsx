/**
 * The select look shared by `SendouSelect` and `SearchSelect`: the trigger
 * button, the popover with its search field, and the list box items' focus and
 * selection states. Both selects render their own contents inside these.
 */

import clsx from "clsx";
import { ChevronsUpDown, Search, X } from "lucide-react";
import type * as React from "react";
import {
	Button,
	Input,
	ListBox,
	ListBoxItem,
	type ListBoxItemProps,
	Popover,
	SearchField,
	Select,
	type SelectProps,
} from "react-aria-components";
import styles from "./SelectShell.module.css";

export function SelectShell<T extends object>({
	className,
	children,
	...rest
}: SelectProps<T> & { children: React.ReactNode }) {
	return (
		<Select {...rest} className={clsx(className, styles.select)}>
			{children}
		</Select>
	);
}

export function SelectShellTrigger({
	ref,
	children,
}: {
	ref?: React.Ref<HTMLButtonElement>;
	children: React.ReactNode;
}) {
	return (
		<Button className={styles.button} ref={ref}>
			{children}
			<span aria-hidden="true">
				<ChevronsUpDown className={styles.icon} />
			</span>
		</Button>
	);
}

export function SelectShellPopover({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Popover className={clsx(className, styles.popover)}>{children}</Popover>
	);
}

export function SelectShellSearchField({
	placeholder,
	inputClassName,
	inputTestId,
}: {
	placeholder?: string;
	inputClassName?: string;
	inputTestId?: string;
}) {
	return (
		<SearchField aria-label="Search" autoFocus className={styles.searchField}>
			<Search aria-hidden className={styles.icon} />
			<Input
				placeholder={placeholder}
				className={clsx(inputClassName, styles.searchInput)}
				data-testid={inputTestId}
			/>
			<Button className={styles.searchClearButton}>
				<X className={styles.icon} />
			</Button>
		</SearchField>
	);
}

export function SelectShellListBox<T extends object>({
	items,
	className,
	renderEmptyState,
	children,
}: {
	items?: Iterable<T>;
	className?: string;
	renderEmptyState?: () => React.ReactNode;
	children: React.ReactNode | ((item: T) => React.ReactNode);
}) {
	return (
		<ListBox
			items={items}
			className={clsx(className, styles.listBox)}
			renderEmptyState={renderEmptyState}
		>
			{children}
		</ListBox>
	);
}

/** list box item carrying the shared focus/selection styling */
export function SelectShellItem({
	className,
	...rest
}: Omit<ListBoxItemProps, "className"> & { className?: string }) {
	return (
		<ListBoxItem
			{...rest}
			className={({ isFocused, isSelected }) =>
				clsx(className, {
					[styles.itemFocused]: isFocused,
					[styles.itemSelected]: isSelected,
				})
			}
		/>
	);
}
