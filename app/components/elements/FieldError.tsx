import { FieldError as ReactAriaFieldError } from "react-aria-components";
import styles from "../FormMessage.module.css";

export function SendouFieldError({
	children,
	id,
}: {
	children?: React.ReactNode;
	id?: string;
}) {
	return (
		<ReactAriaFieldError className={styles.error} id={id}>
			{children}
		</ReactAriaFieldError>
	);
}
