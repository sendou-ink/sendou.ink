import clsx from "clsx";
import type * as React from "react";
import styles from "./Switch.module.css";

interface SendouSwitchProps {
	id?: string;
	isSelected?: boolean;
	defaultSelected?: boolean;
	onChange?: (isSelected: boolean) => void;
	isDisabled?: boolean;
	size?: "small" | "large";
	"aria-label"?: string;
	"data-testid"?: string;
	children?: React.ReactNode;
}

export function SendouSwitch({
	id,
	isSelected,
	defaultSelected,
	onChange,
	isDisabled,
	size,
	"aria-label": ariaLabel,
	"data-testid": testId,
	children,
}: SendouSwitchProps) {
	return (
		<label
			className={clsx(styles.root, {
				[styles.small]: size === "small",
				[styles.large]: size === "large",
			})}
			data-testid={testId}
		>
			<input
				id={id}
				type="checkbox"
				// eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- the native checked attribute supplies the switch state
				role="switch"
				className={styles.input}
				checked={isSelected}
				defaultChecked={isSelected === undefined ? defaultSelected : undefined}
				disabled={isDisabled}
				aria-label={ariaLabel}
				onChange={(event) => onChange?.(event.currentTarget.checked)}
			/>
			<div className={styles.indicator} />
			{children}
		</label>
	);
}
