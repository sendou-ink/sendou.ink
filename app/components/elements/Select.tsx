import clsx from "clsx";
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
import { ChevronUpDownIcon } from "~/components/icons/ChevronUpDown";
import { Image } from "../Image";
import { CrossIcon } from "../icons/Cross";
import { SearchIcon } from "../icons/Search";
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
// xxx: refactor this to only be a Select and SelectFormField adds the label and BottomTexts
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

	return (
		<Select
			{...props}
			className={clsx(className, styles.select)}
			onOpenChange={handleOpenChange}
		>
			{label ? <Label>{label}</Label> : null}
			<Button className={styles.button}>
				<SelectValue className={styles.selectValue} />
				<span aria-hidden="true">
					<ChevronUpDownIcon className={styles.icon} />
				</span>
			</Button>
			{clearable ? <SelectClearButton /> : null}
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<Popover className={clsx(popoverClassName, styles.popover)}>
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
							<SearchIcon aria-hidden className={styles.smallIcon} />
							<Input
								placeholder={search.placeholder}
								className={clsx("plain", styles.searchInput)}
							/>
							<Button className={styles.searchClearButton}>
								<CrossIcon className={styles.smallIcon} />
							</Button>
						</SearchField>
					) : null}
					<Virtualizer layout={ListLayout} layoutOptions={{ rowHeight: 33 }}>
						<ListBox
							items={items}
							className={styles.listBox}
							renderEmptyState={() => (
								<div className={styles.noResults}>{t("common:noResults")}</div>
							)}
						>
							{children}
						</ListBox>
					</Virtualizer>
				</Autocomplete>
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
			icon={<CrossIcon />}
			onPress={() => state?.setSelectedKey(null)}
			className={styles.clearButton}
		>
			Clear
		</SendouButton>
	);
}
