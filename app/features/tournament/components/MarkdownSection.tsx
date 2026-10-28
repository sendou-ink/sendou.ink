import { Markdown } from "~/components/Markdown";
import styles from "./MarkdownSection.module.css";

/** Organizer-authored markdown (tournament description, rules) as prose. */
export function MarkdownSection({ html }: { html: string }) {
	return <Markdown html={html} className={styles.section} />;
}
