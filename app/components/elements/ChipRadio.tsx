import styles from "./ChipRadio.module.css";

interface SendouChipRadioGroupProps
	extends Pick<
		React.AriaAttributes,
		| "aria-label"
		| "aria-labelledby"
		| "aria-describedby"
		| "aria-invalid"
		| "aria-errormessage"
		| "aria-required"
	> {
	children: React.ReactNode;
	orientation?: "horizontal" | "vertical";
	wrap?: boolean;
	className?: string;
}

interface SendouChipRadioProps {
	name: string;
	value: string;
	checked: boolean;
	onChange: (value: string) => void;
	children: React.ReactNode;
}

export function SendouChipRadioGroup({
	children,
	orientation = "horizontal",
	wrap = false,
	className,
	...ariaProps
}: SendouChipRadioGroupProps) {
	return (
		<div
			className={className ? `${styles.group} ${className}` : styles.group}
			data-orientation={orientation}
			data-wrap={wrap}
			role="radiogroup"
			{...ariaProps}
		>
			{children}
		</div>
	);
}

export function SendouChipRadio({
	name,
	value,
	checked,
	onChange,
	children,
}: SendouChipRadioProps) {
	const id = `chip-radio-${name}-${value}`;

	return (
		<>
			<input
				type="radio"
				id={id}
				name={name}
				value={value}
				checked={checked}
				onChange={() => onChange(value)}
				className={styles.radio}
			/>
			<label htmlFor={id} className={styles.label}>
				{children}
			</label>
		</>
	);
}
