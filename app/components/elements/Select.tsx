import clsx from "clsx";
import * as React from "react";
import type { ListBoxItemProps, SelectProps } from "react-aria-components";
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
	Virtualizer,
	useFilter,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { SendouBottomTexts } from "~/components/elements/BottomTexts";
import { SendouButton } from "~/components/elements/Button";
import { ChevronUpDownIcon } from "~/components/icons/ChevronUpDown";
import { CrossIcon } from "../icons/Cross";
import { SearchIcon } from "../icons/Search";
import styles from "./Select.module.css";

interface SendouSelectProps<T extends object>
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
}

// xxx: ticket for cant be cleared? (country input)
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
					filter={isControlled ? undefined : contains}
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
	heading: React.ReactNode;
	children: React.ReactNode;
}

export function SendouSelectItemSection({
	heading,
	children,
}: SendouSelectItemSectionProps) {
	return (
		<ListBoxSection>
			<Header>{heading}</Header>
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
