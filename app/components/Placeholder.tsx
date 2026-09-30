import styles from "./Placeholder.module.css";

/** Blank placeholder while content loads; unlike null it keeps the footer down. */
export function Placeholder() {
	return <div className={styles.placeholder} />;
}
