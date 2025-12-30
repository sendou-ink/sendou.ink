import clsx from "clsx";
import styles from "./Input.module.css";

export function Input({
	name,
	id,
	className,
	minLength,
	maxLength,
	required,
	defaultValue,
	leftAddon,
	icon,
	type,
	min,
	max,
	pattern,
	list,
	testId,
	"aria-label": ariaLabel,
	value,
	placeholder,
	onChange,
	disableAutoComplete = false,
	readOnly,
}: {
	name?: string;
	id?: string;
	className?: string;
	minLength?: number;
	maxLength?: number;
	required?: boolean;
	defaultValue?: string;
	leftAddon?: string;
	icon?: React.ReactNode;
	type?: "number" | "date";
	min?: number;
	max?: number | string;
	pattern?: string;
	list?: string;
	testId?: string;
	"aria-label"?: string;
	value?: string;
	placeholder?: string;
	onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
	disableAutoComplete?: boolean;
	readOnly?: boolean;
}) {
	return (
		<div
			className={clsx(styles.container, className, {
				[styles.readOnly]: readOnly,
			})}
		>
			{leftAddon ? <div className={styles.addon}>{leftAddon}</div> : null}
			<input
				className="in-container"
				name={name}
				id={id}
				minLength={minLength}
				maxLength={maxLength}
				min={min}
				max={max}
				defaultValue={defaultValue}
				pattern={pattern}
				list={list}
				data-testid={testId}
				value={value}
				onChange={onChange}
				aria-label={ariaLabel}
				required={required}
				placeholder={placeholder}
				type={type}
				autoComplete={disableAutoComplete ? "one-time-code" : undefined}
				readOnly={readOnly}
			/>
			{icon}
		</div>
	);
}
