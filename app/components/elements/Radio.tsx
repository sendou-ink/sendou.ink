import * as React from "react";
import styles from "./Radio.module.css";

interface RadioGroupContextValue {
	name: string;
	value: string | null;
	isDisabled?: boolean;
	onChange: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(
	null,
);

export function SendouRadioGroup({
	value,
	onChange,
	isDisabled,
	className,
	"aria-label": ariaLabel,
	children,
}: {
	value: string | null;
	onChange: (value: string) => void;
	isDisabled?: boolean;
	className?: string;
	"aria-label"?: string;
	children: React.ReactNode;
}) {
	const name = React.useId();

	return (
		<div role="radiogroup" aria-label={ariaLabel} className={className}>
			<RadioGroupContext value={{ name, value, isDisabled, onChange }}>
				{children}
			</RadioGroupContext>
		</div>
	);
}

interface SendouRadioRenderProps {
	isSelected: boolean;
	isFocusVisible: boolean;
	isHovered: boolean;
}

export function SendouRadio({
	value,
	className,
	"aria-label": ariaLabel,
	"data-testid": testId,
	onClick,
	children,
}: {
	value: string;
	className?: string;
	"aria-label"?: string;
	"data-testid"?: string;
	onClick?: () => void;
	children:
		| React.ReactNode
		| ((renderProps: SendouRadioRenderProps) => React.ReactNode);
}) {
	const group = React.use(RadioGroupContext);
	if (!group) throw new Error("SendouRadio must be inside SendouRadioGroup");

	const [isFocusVisible, setFocusVisible] = React.useState(false);
	const [isHovered, setHovered] = React.useState(false);

	const isSelected = group.value === value;

	return (
		<label
			className={className}
			data-testid={testId}
			data-selected={isSelected ? "true" : undefined}
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
		>
			<input
				type="radio"
				className={styles.input}
				name={group.name}
				value={value}
				checked={isSelected}
				disabled={group.isDisabled}
				aria-label={ariaLabel}
				onChange={() => group.onChange(value)}
				onClick={onClick}
				onFocus={(event) =>
					setFocusVisible(event.currentTarget.matches(":focus-visible"))
				}
				onBlur={() => setFocusVisible(false)}
			/>
			{typeof children === "function"
				? children({ isSelected, isFocusVisible, isHovered })
				: children}
		</label>
	);
}
