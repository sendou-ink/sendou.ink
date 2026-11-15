import {
	type SelectKey,
	SendouSelect,
	SendouSelectItem,
} from "~/components/elements/Select";

/** A select of the designer's controls, its options given as values with their labels. */
export function Choice<Value extends SelectKey>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: Value;
	options: Array<{ value: Value; label: string }>;
	onChange: (value: Value) => void;
}) {
	return (
		<SendouSelect
			label={label}
			items={options.map((option) => ({ id: option.value, ...option }))}
			selectedKey={value}
			onSelectionChange={(key) => {
				const option = options.find((candidate) => candidate.value === key);
				if (option) onChange(option.value);
			}}
		>
			{(item) => (
				<SendouSelectItem key={item.id} id={item.id}>
					{item.label}
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}
