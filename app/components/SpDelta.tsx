import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import * as R from "remeda";
import styles from "./SpDelta.module.css";

/** SP change as a colored chevron (none for zero) and the size. */
export function SpDelta({ diff }: { diff: number }) {
	const rounded = R.round(diff, 2);
	const Icon = rounded > 0 ? ChevronUp : ChevronDown;

	return (
		<span className={styles.container}>
			{rounded === 0 ? null : (
				<Icon
					size="1.25em"
					strokeWidth={3}
					className={clsx(
						styles.icon,
						rounded > 0 ? "text-success" : "text-warning",
					)}
				/>
			)}
			<span>{Math.abs(rounded)}SP</span>
		</span>
	);
}
