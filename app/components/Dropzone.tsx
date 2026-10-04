import clsx from "clsx";
import * as React from "react";
import styles from "./Dropzone.module.css";

interface DropzoneProps {
	/** Id of the file input, for an outside `<label htmlFor>`. */
	id?: string;
	accept: string;
	onFile: (file: File) => void;
	disabled?: boolean;
	/** The prompt, typically wrapping its "choose a file" part in {@link DropzoneAction}. */
	children: React.ReactNode;
}

/** Drop target for one file that also opens the file picker when clicked; the file input inside is the accessible path. */
export function Dropzone({
	id,
	accept,
	onFile,
	disabled,
	children,
}: DropzoneProps) {
	const [isDraggingOver, setIsDraggingOver] = React.useState(false);

	return (
		<label
			className={clsx(styles.dropzone, {
				[styles.over]: isDraggingOver,
				[styles.disabled]: disabled,
			})}
			onDragOver={(event) => {
				if (disabled) return;
				event.preventDefault();
				setIsDraggingOver(true);
			}}
			onDragLeave={(event) => {
				if (event.currentTarget.contains(event.relatedTarget as Node)) return;
				setIsDraggingOver(false);
			}}
			onDrop={(event) => {
				if (disabled) return;
				event.preventDefault();
				setIsDraggingOver(false);
				const file = event.dataTransfer.files[0];
				if (file) onFile(file);
			}}
		>
			{children}
			<input
				id={id}
				type="file"
				accept={accept}
				className={styles.input}
				disabled={disabled}
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) onFile(file);
				}}
			/>
		</label>
	);
}

/** The "choose a file" part of a {@link Dropzone} prompt. */
export function DropzoneAction({ children }: { children?: React.ReactNode }) {
	return <span className={styles.action}>{children}</span>;
}
