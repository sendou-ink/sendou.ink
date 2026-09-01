import styles from "./Label.module.css";

export function SendouLabel({
	children,
	required,
	htmlFor,
}: {
	children: React.ReactNode;
	required?: boolean;
	htmlFor?: string;
}) {
	return (
		<label className={styles.label} htmlFor={htmlFor}>
			{children} {required ? <span className="text-error">*</span> : null}
		</label>
	);
}
