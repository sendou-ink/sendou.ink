import styles from "./MatchPage.module.css";

export function MatchPage({ children }: { children?: React.ReactNode }) {
	return <div className={styles.root}>{children}</div>;
}
