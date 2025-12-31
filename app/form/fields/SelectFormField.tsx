import type { Key } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import type { FormFieldItems, FormFieldProps } from "../types";

type SelectFormFieldProps<V extends string> = Omit<
	FormFieldProps<"select">,
	"items" | "clearable" | "onBlur"
> & {
	items: FormFieldItems<V>;
	value: V | null;
	onChange: (value: V | null) => void;
	clearable?: boolean;
	onSelect?: (value: V) => void;
	onBlur?: () => void;
};

export function SelectFormField<V extends string>({
	label,
	name,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
	clearable,
	onSelect,
}: SelectFormFieldProps<V>) {
	const { t, i18n } = useTranslation();

	const translateIfKey = (text: string | undefined): string | undefined => {
		if (typeof text !== "string") return text;
		return text.includes(":") ? t(text as never) : text;
	};

	const translatedLabel = translateIfKey(label);
	const translatedBottomText = translateIfKey(bottomText);
	const translatedError = translateIfKey(error);

	const itemsWithResolvedLabels = items.map((item) => {
		const itemLabel = item.label;
		const resolvedLabel =
			typeof itemLabel === "function"
				? itemLabel(i18n.language)
				: typeof itemLabel === "string" && itemLabel.includes(":")
					? t(itemLabel as never)
					: String(itemLabel);

		return {
			...item,
			id: item.value,
			resolvedLabel,
		};
	});

	const handleSelectionChange = (key: Key | null) => {
		const newValue = key as V | null;
		onChange(newValue);
		if (newValue && onSelect) {
			onSelect(newValue);
		}
		onBlur?.();
	};

	// xxx: should we switch between react-aria-components Select and a basic one?
	return (
		<SendouSelect
			name={name}
			label={translatedLabel}
			items={itemsWithResolvedLabels}
			selectedKey={value}
			onSelectionChange={handleSelectionChange}
			clearable={clearable}
			errorText={translatedError}
			bottomText={translatedBottomText}
		>
			{(item) => (
				<SendouSelectItem
					key={item.id}
					id={item.id}
					textValue={item.resolvedLabel}
				>
					{item.resolvedLabel}
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}
