import clsx from "clsx";
import type {
	ListBoxItemProps,
	SelectProps,
	ValidationResult,
} from "react-aria-components";
import {
	Autocomplete,
	Button,
	FieldError,
	Input,
	ListBox,
	ListBoxItem,
	ListLayout,
	Popover,
	SearchField,
	Select,
	SelectValue,
	Text,
	Virtualizer,
	useFilter,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Label } from "~/components/Label";
import { ChevronUpDownIcon } from "~/components/icons/ChevronUpDown";
import { CrossIcon } from "../icons/Cross";
import { SearchIcon } from "../icons/Search";
import styles from "./Select.module.css";

interface SendouSelectProps<T extends object>
	extends Omit<SelectProps<T>, "children"> {
	label?: string;
	description?: string;
	errorMessage?: string | ((validation: ValidationResult) => string);
	items?: Iterable<T>;
	children: React.ReactNode | ((item: T) => React.ReactNode);
	search?: {
		placeholder?: string;
	};
}

export function SendouSelect<T extends object>({
	label,
	description,
	errorMessage,
	children,
	items,
	search,
	...props
}: SendouSelectProps<T>) {
	const { t } = useTranslation(["common"]);
	const { contains } = useFilter({ sensitivity: "base" });

	return (
		<Select {...props}>
			{label ? <Label>{label}</Label> : null}
			<Button className={styles.button}>
				<SelectValue className={styles.selectValue} />
				<span aria-hidden="true">
					<ChevronUpDownIcon className={styles.icon} />
				</span>
			</Button>
			{description && <Text slot="description">{description}</Text>}
			<FieldError>{errorMessage}</FieldError>
			<Popover className={styles.popover}>
				<Autocomplete filter={contains}>
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
