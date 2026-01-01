import type { Key } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { CrossIcon } from "~/components/icons/Cross";
import type { FormFieldItems, FormFieldProps } from "../types";
import { FormFieldMessages } from "./FormFieldWrapper";

type MultiSelectFormFieldProps<V extends string> = Omit<
	FormFieldProps<"multi-select">,
	"items" | "clearable" | "name"
> & {
	items: FormFieldItems<V>;
	value: V[];
	onChange: (value: V[]) => void;
};

export function MultiSelectFormField<V extends string>({
	label,
	bottomText,
	items,
	error,
	onBlur,
	value,
	onChange,
}: MultiSelectFormFieldProps<V>) {
	const { i18n } = useTranslation();

	const itemsWithResolvedLabels = items.map((item) => ({
		...item,
		id: item.value,
		resolvedLabel:
			typeof item.label === "function"
				? item.label(i18n.language)
				: String(item.label),
	}));

	const itemsPicked = value.map(
		(v) => itemsWithResolvedLabels.find((item) => item.value === v)!,
	);
	const itemsAvailable = itemsWithResolvedLabels.filter(
		(item) => !value.includes(item.value),
	);

	const handleSelect = (key: Key | null) => {
		if (!key) return;
		const selectedValue = key as V;
		onChange([...value, selectedValue]);
		onBlur?.();
	};

	const handleRemove = (itemValue: V) => {
		onChange(value.filter((v) => v !== itemValue));
	};

	return (
		<div className="stack xs">
			<div className="stack sm">
				<SendouSelect
					label={label}
					items={itemsAvailable}
					selectedKey={null}
					onSelectionChange={handleSelect}
					clearable
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
				{value.length > 0 ? (
					<ol
						className="stack horizontal sm"
						style={{ flexWrap: "wrap", padding: 0 }}
					>
						{itemsPicked.map((item, idx) => (
							<li
								key={item.value}
								// xxx: use CSS
								style={{
									listStyle: "none",
									fontSize: "var(--fonts-xs)",
									fontWeight: "var(--semi-bold)",
									backgroundColor: "var(--color-base-card)",
									padding: "var(--s-1) var(--s-2)",
									borderRadius: "var(--radius-field)",
									display: "flex",
									alignItems: "center",
									gap: "var(--s-2)",
								}}
							>
								{idx + 1}) {item.resolvedLabel}
								<SendouButton
									icon={<CrossIcon />}
									variant="minimal-destructive"
									size="miniscule"
									onPress={() => handleRemove(item.value)}
								/>
							</li>
						))}
					</ol>
				) : null}
			</div>
			<FormFieldMessages error={error} bottomText={bottomText} />
		</div>
	);
}
