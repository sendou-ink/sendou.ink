import { FieldError as ReactAriaFieldError } from "react-aria-components";

export function SendouFieldError({
	children,
	id,
}: {
	children?: React.ReactNode;
	id?: string;
}) {
	return (
		<ReactAriaFieldError className="error-message" id={id}>
			{children}
		</ReactAriaFieldError>
	);
}
