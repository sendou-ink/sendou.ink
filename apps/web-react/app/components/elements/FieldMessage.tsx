import { Text } from "react-aria-components";
import styles from "../FormMessage.module.css";

export function SendouFieldMessage({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<Text slot="description" className={styles.info}>
			{children}
		</Text>
	);
}
