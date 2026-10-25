import * as React from "react";
import styles from "./JsonTree.module.css";

const MAX_CHILDREN = 100;

/** Collapsible view of JSON-like data. Levels above `openDepth` start expanded. */
export function JsonTree({
	value,
	openDepth = 1,
}: {
	value: unknown;
	openDepth?: number;
}) {
	return (
		<div className={styles.tree}>
			<JsonNode name={null} value={value} depth={0} openDepth={openDepth} />
		</div>
	);
}

function JsonNode({
	name,
	value,
	depth,
	openDepth,
}: {
	name: string | null;
	value: unknown;
	depth: number;
	openDepth: number;
}) {
	const [isOpen, setIsOpen] = React.useState(depth < openDepth);
	const label =
		name === null ? null : <span className={styles.key}>{name}:</span>;

	if (!isExpandable(value)) {
		return (
			<div className={styles.leaf}>
				{label} <Primitive value={value} />
			</div>
		);
	}

	const entries: Array<[string, unknown]> = Array.isArray(value)
		? value.map((item, index) => [String(index), item])
		: Object.entries(value);
	const shown = entries.slice(0, MAX_CHILDREN);

	return (
		<details
			open={isOpen}
			onToggle={(event) => setIsOpen(event.currentTarget.open)}
		>
			<summary className={styles.summary}>
				{label}{" "}
				<span className={styles.preview}>
					{Array.isArray(value)
						? `Array(${entries.length})`
						: `{${entries.length === 0 ? "" : " … "}}`}
				</span>
				{!Array.isArray(value) && entries.length > 0 ? (
					<span className={styles.count}>{entries.length} keys</span>
				) : null}
			</summary>
			{isOpen ? (
				<div className={styles.children}>
					{shown.map(([key, child]) => (
						<JsonNode
							key={key}
							name={key}
							value={child}
							depth={depth + 1}
							openDepth={openDepth}
						/>
					))}
					{entries.length > shown.length ? (
						<div className={styles.more}>
							…{entries.length - shown.length} more
						</div>
					) : null}
				</div>
			) : null}
		</details>
	);
}

function Primitive({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className={styles.null}>{String(value)}</span>;
	}
	if (typeof value === "string") {
		return <span className={styles.string}>"{value}"</span>;
	}
	if (typeof value === "number" || typeof value === "bigint") {
		return <span className={styles.number}>{String(value)}</span>;
	}
	if (typeof value === "boolean") {
		return <span className={styles.boolean}>{String(value)}</span>;
	}
	if (value instanceof Date) {
		return <span className={styles.string}>{value.toISOString()}</span>;
	}
	if (value instanceof Map || value instanceof Set) {
		return (
			<span className={styles.null}>
				{value instanceof Map ? "Map" : "Set"}({value.size})
			</span>
		);
	}
	if (value instanceof Promise) {
		return <span className={styles.null}>Promise (deferred)</span>;
	}

	return <span className={styles.null}>{String(value)}</span>;
}

function isExpandable(value: unknown): value is object {
	if (typeof value !== "object" || value === null) return false;
	if (value instanceof Date || value instanceof Promise) return false;
	if (value instanceof Map || value instanceof Set) return false;

	return true;
}
