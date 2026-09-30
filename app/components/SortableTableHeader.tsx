import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import styles from "./SortableTableHeader.module.css";

export type SortDirection = "asc" | "desc";

export type SortState<Key extends string = string> = {
	key: Key;
	dir: SortDirection;
} | null;

export function SortableTableHeader<Key extends string>({
	label,
	sortKey,
	sort,
	onChange,
}: {
	label: string;
	sortKey: Key;
	sort: SortState<Key>;
	onChange: (next: SortState<Key>) => void;
}) {
	const active = sort?.key === sortKey;

	return (
		<th>
			<button
				type="button"
				className={styles.sortHeader}
				onClick={() => onChange(nextSortState(sort, sortKey))}
			>
				{label}
				{active ? (
					sort.dir === "asc" ? (
						<ArrowUp className={styles.sortIcon} />
					) : (
						<ArrowDown className={styles.sortIcon} />
					)
				) : (
					<ChevronsUpDown
						className={clsx(styles.sortIcon, styles.sortIconInactive)}
						aria-hidden
					/>
				)}
			</button>
		</th>
	);
}

function nextSortState<Key extends string>(
	current: SortState<Key>,
	key: Key,
): SortState<Key> {
	if (current?.key !== key) return { key, dir: "asc" };
	if (current.dir === "asc") return { key, dir: "desc" };
	return null;
}
