import {
	Switch as ReactAriaSwitch,
	type SwitchProps as ReactAriaSwitchProps,
} from "react-aria-components";
import styles from "./Switch.module.css";

interface SendouSwitchProps extends ReactAriaSwitchProps {
	children?: React.ReactNode;
}

export function SendouSwitch({ children, ...rest }: SendouSwitchProps) {
	return (
		<ReactAriaSwitch {...rest} className={styles.root}>
			<div className={styles.indicator} />
			{children}
		</ReactAriaSwitch>
	);
}
