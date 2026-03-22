import clsx from "clsx";
import type * as React from "react";
import styles from "./Main.module.css";

export const Main = ({
	children,
	className,
	classNameOverwrite,
	halfWidth,
	bigger,
	style,
}: {
	children: React.ReactNode;
	className?: string;
	classNameOverwrite?: string;
	halfWidth?: boolean;
	bigger?: boolean;
	style?: React.CSSProperties;
}) => {
	return (
		<main
			className={
				classNameOverwrite
					? clsx(classNameOverwrite, {
							[styles.narrow]: halfWidth,
						})
					: clsx(
							styles.main,
							styles.normal,
							{
								[styles.narrow]: halfWidth,
								[styles.wide]: bigger,
							},
							className,
						)
			}
			style={style}
		>
			{children}
		</main>
	);
};

export { styles as mainStyles };

export const containerClassName = (width: "narrow" | "normal" | "wide") => {
	if (width === "narrow") {
		return styles.narrow;
	}

	if (width === "wide") {
		return styles.wide;
	}

	return styles.normal;
};
