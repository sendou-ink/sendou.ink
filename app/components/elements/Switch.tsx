import clsx from "clsx";
import {
	Switch as ReactAriaSwitch,
	type SwitchProps as ReactAriaSwitchProps,
} from "react-aria-components";
import styles from "./Switch.module.css";

interface SendouSwitchProps extends ReactAriaSwitchProps {
	children?: React.ReactNode;
	size?: "small" | "medium";
}

export function SendouSwitch({ children, size, ...rest }: SendouSwitchProps) {
	return (
		<ReactAriaSwitch
			{...rest}
			className={clsx(styles.root, { [styles.small]: size === "small" })}
		>
			<div className={styles.indicator} />
			{children}
		</ReactAriaSwitch>
	);
}
