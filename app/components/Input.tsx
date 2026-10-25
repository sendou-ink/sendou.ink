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
	onKeyDown,
	onBlur,
	disableAutoComplete = false,
	readOnly,
	autoFocus,
	ref,
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
	type?: "number" | "date" | "search";
	min?: number;
	max?: number | string;
	pattern?: string;
	list?: string;
	testId?: string;
	"aria-label"?: string;
	value?: string;
	placeholder?: string;
	onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
	disableAutoComplete?: boolean;
	readOnly?: boolean;
	autoFocus?: boolean;
	ref?: React.Ref<HTMLInputElement>;
}) {
	return (
		<div
			className={clsx(styles.container, className, {
				[styles.readOnly]: readOnly,
			})}
		>
			{leftAddon ? <div className={styles.addon}>{leftAddon}</div> : null}
			<input
				ref={ref}
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
				onKeyDown={onKeyDown}
				onBlur={onBlur}
				aria-label={ariaLabel}
				required={required}
				placeholder={placeholder}
				type={type}
				enterKeyHint={type === "search" ? "search" : undefined}
				autoComplete={disableAutoComplete ? "one-time-code" : undefined}
				readOnly={readOnly}
				// biome-ignore lint/a11y/noAutofocus: opt-in per call site
				autoFocus={autoFocus}
			/>
			{icon}
		</div>
	);
}
