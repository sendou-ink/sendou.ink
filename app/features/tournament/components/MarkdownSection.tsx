import { Markdown } from "~/components/Markdown";
import styles from "./MarkdownSection.module.css";

/** Organizer-authored markdown (tournament description, rules) as prose. */
export function MarkdownSection({ children }: { children: string }) {
	return (
		<section className={styles.section}>
			<Markdown>{children}</Markdown>
		</section>
	);
}
