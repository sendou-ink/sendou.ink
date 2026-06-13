import clsx from "clsx";
import { ChevronsUpDown, Search, X } from "lucide-react";
import * as React from "react";
import type {
	AutocompleteProps,
	ListBoxItemProps,
	SelectProps,
} from "react-aria-components";
import {
	Autocomplete,
	Button,
	Header,
	Input,
	Label,
	ListBox,
	ListBoxItem,
	ListBoxSection,
	ListLayout,
	Popover,
	SearchField,
	Select,
	SelectStateContext,
	SelectValue,
	useFilter,
	Virtualizer,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouButton } from "~/components/elements/Button";
import { Image } from "../Image";
import styles from "./Select.module.css";

export interface SendouSelectProps<T extends object>
	extends Omit<SelectProps<T>, "children"> {
	label?: string;
	description?: string;
	errorText?: string;
	bottomText?: string;
	items?: Iterable<T>;
	children: React.ReactNode | ((item: T) => React.ReactNode);
	search?: {
		placeholder?: string;
	};
	popoverClassName?: string;
	/** Value of the search input, used for controlled components */
	searchInputValue?: string;
	/** Callback for when the search input value changes. When defined `items` has to be filtered on the caller side (automatic filtering in component disabled). */
	onSearchInputChange?: (value: string) => void;
	clearable?: boolean;
	filter?: AutocompleteProps<object>["filter"];
}

/**
 * A customizable select component with optional search functionality. Virtualizes the list of items for performance.
 *
 * @example
 * ```tsx
 * <SendouSelect items={items} search={{ placeholder: "Search for items..." }}>
 *   {({ key, ...item }) => (
 *     <SendouSelectItem key={key} {...item}>
 *       {item.name}
 *     </SendouSelectItem>
 *   )}
 * </SendouSelect>
 * ```
 */
export function SendouSelect<T extends object>({
	label,
	description,
	errorText,
	bottomText,
	children,
	items,
	search,
	popoverClassName,
	searchInputValue,
	onSearchInputChange,
	clearable = false,
	className,
	filter,
	...props
}: SendouSelectProps<T>) {
	const { t } = useTranslation(["common"]);
	const { contains } = useFilter({ sensitivity: "base" });

	const isControlled = !!onSearchInputChange;

	const handleOpenChange = (isOpen: boolean) => {
		if (!isControlled) return;

		if (!isOpen) {
			onSearchInputChange("");
		}
	};

	const listBox = (
		<Virtualizer layout={ListLayout} layoutOptions={{ rowHeight: 33 }}>
			<ListBox
				items={items}
				className={clsx(styles.listBox, "scrollbar")}
				renderEmptyState={() => (
					<div className={styles.noResults}>{t("common:noResults")}</div>
				)}
			>
				{children}
			</ListBox>
		</Virtualizer>
	);

	// The Autocomplete wrapper filters the collection, but its filtering drops
	// items with a falsy key (e.g. `0`). When there is nothing to filter we skip
	// it entirely so such items always render.
	const filterable = !!search || isControlled || !!filter;

	return (
		<Select
			{...props}
			className={clsx(className, styles.select)}
			onOpenChange={handleOpenChange}
		>
			{label ? <Label className={styles.label}>{label}</Label> : null}
			<Button className={styles.button}>
				<SelectValue className={styles.selectValue} />
				<span aria-hidden="true">
					<ChevronsUpDown className={styles.icon} />
				</span>
			</Button>
			{clearable ? <SelectClearButton /> : null}
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<Popover className={clsx(popoverClassName, styles.popover)}>
				{filterable ? (
					<Autocomplete
						filter={filter ? filter : isControlled ? undefined : contains}
						inputValue={searchInputValue}
						onInputChange={onSearchInputChange}
					>
						{search ? (
							<SearchField
								aria-label="Search"
								autoFocus
								className={styles.searchField}
							>
								<Search aria-hidden className={styles.icon} />
								<Input
									placeholder={search.placeholder}
									className={clsx(styles.searchInput, "in-container")}
								/>
								<Button className={styles.searchClearButton}>
									<X className={styles.icon} />
								</Button>
							</SearchField>
						) : null}
						{listBox}
					</Autocomplete>
				) : (
					listBox
				)}
			</Popover>
		</Select>
	);
}

interface SendouSelectItemProps extends ListBoxItemProps {}

export function SendouSelectItem(props: SendouSelectItemProps) {
	return (
		<ListBoxItem
			{...props}
			className={({ isFocused, isSelected }) =>
				clsx(styles.item, {
					[styles.itemFocused]: isFocused,
					[styles.itemSelected]: isSelected,
				})
			}
		/>
	);
}

interface SendouSelectItemSectionProps {
	heading: string;
	headingImgPath?: string;
	children: React.ReactNode;
	className?: string;
}

export function SendouSelectItemSection({
	heading,
	headingImgPath,
	children,
	className,
}: SendouSelectItemSectionProps) {
	return (
		<ListBoxSection>
			<Header className={clsx(className, styles.categoryHeading)}>
				{headingImgPath ? (
					<Image path={headingImgPath} size={28} alt="" />
				) : null}
				{heading}
				<div className={styles.categoryDivider} />
			</Header>
			{children}
		</ListBoxSection>
	);
}

function SelectClearButton() {
	const state = React.useContext(SelectStateContext);

	if (!state?.selectedKey) return null;

	return (
		<SendouButton
			// Don't inherit behavior from Select.
			slot={null}
			variant="minimal-destructive"
			size="miniscule"
			icon={<X />}
			onPress={() => state?.setSelectedKey(null)}
			className={styles.clearButton}
		>
			Clear
		</SendouButton>
	);
}
