import clsx from "clsx";
import * as React from "react";
import styles from "./Dropzone.module.css";

type DropzoneProps = {
	/** Id of the file input, for an outside `<label htmlFor>`. */
	id?: string;
	accept: string;
	disabled?: boolean;
	/** The prompt, typically wrapping its "choose a file" part in {@link DropzoneAction}. */
	children: React.ReactNode;
} & (
	| { multiple?: false; onFile: (file: File) => void }
	| { multiple: true; onFiles: (files: File[]) => void }
);

/** Drop target for one file (or several) that also opens the file picker when clicked; the file input inside is the accessible path. */
export function Dropzone(props: DropzoneProps) {
	const { id, accept, disabled, children } = props;
	const [isDraggingOver, setIsDraggingOver] = React.useState(false);

	const pick = (fileList: FileList | null | undefined) => {
		const files = Array.from(fileList ?? []);
		if (props.multiple) {
			if (files.length > 0) props.onFiles(files);
		} else if (files[0]) {
			props.onFile(files[0]);
		}
	};

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
				pick(event.dataTransfer.files);
			}}
		>
			{children}
			<input
				id={id}
				type="file"
				accept={accept}
				multiple={props.multiple}
				className={styles.input}
				disabled={disabled}
				onChange={(event) => {
					const files = event.target.files;
					pick(files);
					event.target.value = "";
				}}
			/>
		</label>
	);
}

/** The "choose a file" part of a {@link Dropzone} prompt. */
export function DropzoneAction({ children }: { children?: React.ReactNode }) {
	return <span className={styles.action}>{children}</span>;
}
