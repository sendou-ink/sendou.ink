import clsx from "clsx";
import type {
	ListBoxItemProps,
	SelectProps,
	ValidationResult,
} from "react-aria-components";
import {
	Button,
	FieldError,
	ListBox,
	ListBoxItem,
	Popover,
	Select,
	SelectValue,
	Text,
} from "react-aria-components";
import { Label } from "~/components/Label";
import { ChevronUpDownIcon } from "~/components/icons/ChevronUpDown";
import styles from "./Select.module.css";

interface SendouSelectProps<T extends object>
	extends Omit<SelectProps<T>, "children"> {
	label?: string;
	description?: string;
	errorMessage?: string | ((validation: ValidationResult) => string);
	items?: Iterable<T>;
	children: React.ReactNode | ((item: T) => React.ReactNode);
}

export function SendouSelect<T extends object>({
	label,
	description,
	errorMessage,
	children,
	items,
	...props
}: SendouSelectProps<T>) {
	return (
		<Select {...props}>
			{label ? <Label>{label}</Label> : null}
			<Button className={styles.button}>
				<SelectValue className={styles.selectValue} />
				<span aria-hidden="true">
					<ChevronUpDownIcon className={styles.buttonIcon} />
				</span>
			</Button>
			{description && <Text slot="description">{description}</Text>}
			<FieldError>{errorMessage}</FieldError>
			<Popover className={styles.popover}>
				<ListBox items={items}>{children}</ListBox>
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
