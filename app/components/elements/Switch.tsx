import clsx from "clsx";
import {
	Switch as ReactAriaSwitch,
	type SwitchProps as ReactAriaSwitchProps,
} from "react-aria-components";

interface SendouSwitchProps extends ReactAriaSwitchProps {
	children: React.ReactNode;
	// xxx: standardize with button?
	size?: "small" | "medium";
}

export function SendouSwitch({ children, size, ...rest }: SendouSwitchProps) {
	return (
		<ReactAriaSwitch
			{...rest}
			className={clsx("react-aria-Switch", { tiny: size === "small" })}
		>
			<div className="indicator" />
			{children}
		</ReactAriaSwitch>
	);
}
