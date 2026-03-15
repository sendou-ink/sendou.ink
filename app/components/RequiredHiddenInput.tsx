import styles from "./RequiredHiddenInput.module.css";

export function RequiredHiddenInput({
	value,
	isValid,
	name,
}: {
	value: string;
	isValid: boolean;
	name: string;
}) {
	return (
		<input
			className={styles.input}
			name={name}
			value={isValid ? value : []}
			// empty onChange is because otherwise it will give a React error in console
			// readOnly can't be set as then validation is not active
			onChange={() => null}
			required
		/>
	);
}
