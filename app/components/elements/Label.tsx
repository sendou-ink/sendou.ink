import { Label as ReactAriaLabel } from "react-aria-components";

export function SendouLabel({
	children,
	required,
}: {
	children: React.ReactNode;
	required?: boolean;
}) {
	return (
		<ReactAriaLabel>
			{children} {required && <span className="text-error">*</span>}
		</ReactAriaLabel>
	);
}
