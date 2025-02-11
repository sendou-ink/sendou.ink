import clsx from "clsx";
import {
	Switch as ReactAriaSwitch,
	type SwitchProps as ReactAriaSwitchProps,
} from "react-aria-components";

interface SendouSwitchProps extends ReactAriaSwitchProps {
	children?: React.ReactNode;
	size?: "small" | "medium";
}

export function SendouSwitch({ children, size, ...rest }: SendouSwitchProps) {
	return (
		<ReactAriaSwitch
			{...rest}
			className={clsx("react-aria-Switch", { small: size === "small" })}
		>
			<div className="indicator" />
			{children}
		</ReactAriaSwitch>
	);
}
