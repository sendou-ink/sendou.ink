import clsx from "clsx";
import { X } from "lucide-react";
import * as React from "react";
import type {
	AutocompleteProps,
	ListBoxItemProps,
	SelectProps,
} from "react-aria-components";
import {
	Autocomplete,
	Header,
	Label,
	ListBoxSection,
	ListLayout,
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
import {
	SelectShell,
	SelectShellItem,
	SelectShellListBox,
	SelectShellPopover,
	SelectShellSearchField,
	SelectShellTrigger,
} from "./SelectShell";

const ROW_HEIGHT = 33;

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
	/** controlled search input value */
	searchInputValue?: string;
	/** When defined, the caller filters `items` (automatic filtering disabled). */
	onSearchInputChange?: (value: string) => void;
	clearable?: boolean;
	filter?: AutocompleteProps<object>["filter"];
	/** Measured height of the items, for when they are taller than a single line of text. */
	estimatedRowHeight?: number;
}

/** Select with optional search; virtualizes the item list. */
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
	estimatedRowHeight,
	onOpenChange,
	...props
}: SendouSelectProps<T>) {
	const { t } = useTranslation(["common"]);
	const { contains } = useFilter({ sensitivity: "base" });

	const isControlled = !!onSearchInputChange;

	const handleOpenChange = (isOpen: boolean) => {
		onOpenChange?.(isOpen);

		if (!isControlled) return;

		if (!isOpen) {
			onSearchInputChange("");
		}
	};

	const listBox = (
		<Virtualizer
			layout={ListLayout}
			layoutOptions={
				estimatedRowHeight ? { estimatedRowHeight } : { rowHeight: ROW_HEIGHT }
			}
		>
			<SelectShellListBox
				items={items}
				className="scrollbar"
				renderEmptyState={() => (
					<div className={styles.noResults}>{t("common:noResults")}</div>
				)}
			>
				{children}
			</SelectShellListBox>
		</Virtualizer>
	);

	// the Autocomplete wrapper's filtering drops items with a falsy key (e.g. `0`),
	// so it is skipped entirely when there is nothing to filter
	const filterable = !!search || isControlled || !!filter;

	return (
		<SelectShell
			{...props}
			className={className}
			onOpenChange={handleOpenChange}
		>
			{label ? <Label className={styles.label}>{label}</Label> : null}
			<SelectShellTrigger>
				<SelectValue className={styles.selectValue} />
			</SelectShellTrigger>
			{clearable ? <SelectClearButton /> : null}
			<SendouBottomTexts bottomText={bottomText} errorText={errorText} />
			<SelectShellPopover className={popoverClassName}>
				{filterable ? (
					<Autocomplete
						filter={filter ? filter : isControlled ? undefined : contains}
						inputValue={searchInputValue}
						onInputChange={onSearchInputChange}
					>
						{search ? (
							<SelectShellSearchField
								placeholder={search.placeholder}
								inputClassName="in-container"
							/>
						) : null}
						{listBox}
					</Autocomplete>
				) : (
					listBox
				)}
			</SelectShellPopover>
		</SelectShell>
	);
}

interface SendouSelectItemProps extends ListBoxItemProps {}

export function SendouSelectItem(props: SendouSelectItemProps) {
	return <SelectShellItem {...props} className={styles.item} />;
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
