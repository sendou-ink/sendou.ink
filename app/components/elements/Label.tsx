import { Label as ReactAriaLabel } from "react-aria-components";
import styles from "./Label.module.css";

export function SendouLabel({
	children,
	required,
}: {
	children: React.ReactNode;
	required?: boolean;
}) {
	return (
		<ReactAriaLabel className={styles.label}>
			{children} {required ? <span className="text-error">*</span> : null}
		</ReactAriaLabel>
	);
}
