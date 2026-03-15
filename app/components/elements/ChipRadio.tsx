import styles from "./ChipRadio.module.css";

interface SendouChipRadioGroupProps {
	children: React.ReactNode;
	orientation?: "horizontal" | "vertical";
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
	className,
}: SendouChipRadioGroupProps) {
	return (
		<div
			className={className ? `${styles.group} ${className}` : styles.group}
			data-orientation={orientation}
			role="radiogroup"
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
