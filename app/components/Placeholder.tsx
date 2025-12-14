import styles from "./Placeholder.module.css";

/** Renders a blank placeholder component that can be used while content is loading. Better than returning null because it keeps the footer down where it belongs. */
export function Placeholder() {
	return <div className={styles.placeholder} />;
}
