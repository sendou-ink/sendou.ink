import { FieldError as ReactAriaFieldError } from "react-aria-components";

export function SendouFieldError({ children }: { children: React.ReactNode }) {
	return (
		<ReactAriaFieldError className="error-message">
			{children}
		</ReactAriaFieldError>
	);
}
