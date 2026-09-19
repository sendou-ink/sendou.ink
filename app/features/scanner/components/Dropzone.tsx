/** A drag-and-drop target for one file; the file input inside the children is the accessible path. */
import clsx from "clsx";
import { type ReactNode, useState } from "react";
import styles from "./Dropzone.module.css";

export function Dropzone({
	onFile,
	children,
}: {
	onFile: (file: File) => void;
	children: ReactNode;
}) {
	const [over, setOver] = useState(false);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; the file input inside is the accessible path
		<div
			className={clsx(styles.dropzone, { [styles.over]: over })}
			onDragOver={(e) => {
				e.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				const file = e.dataTransfer.files[0];
				if (file) onFile(file);
			}}
		>
			{children}
		</div>
	);
}
