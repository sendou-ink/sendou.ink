import clsx from "clsx";
import type * as React from "react";
import styles from "./Switch.module.css";

interface SendouSwitchProps
	extends Pick<
		React.AriaAttributes,
		"aria-describedby" | "aria-invalid" | "aria-errormessage"
	> {
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
	...ariaProps
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
				// biome-ignore lint/a11y/useAriaPropsForRole: the native checked attribute supplies the switch state
				role="switch"
				className={styles.input}
				checked={isSelected}
				defaultChecked={isSelected === undefined ? defaultSelected : undefined}
				disabled={isDisabled}
				aria-label={ariaLabel}
				{...ariaProps}
				onChange={(event) => onChange?.(event.currentTarget.checked)}
			/>
			<div className={styles.indicator} />
			{children}
		</label>
	);
}
