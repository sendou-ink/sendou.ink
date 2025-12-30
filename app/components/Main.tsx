import { isRouteErrorResponse, useRouteError } from "@remix-run/react";
import clsx from "clsx";
import type * as React from "react";
import { useHasRole } from "~/modules/permissions/hooks";
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
	const error = useRouteError();
	const isMinorSupporter = useHasRole("MINOR_SUPPORT");
	const showLeaderboard =
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
		!isMinorSupporter &&
		!isRouteErrorResponse(error);

	return (
		<div className={styles.container}>
			<main
				className={
					classNameOverwrite
						? clsx(classNameOverwrite, {
								[styles.narrow]: halfWidth,
								"pt-8-forced": showLeaderboard,
							})
						: clsx(
								styles.main,
								styles.normal,
								{
									[styles.narrow]: halfWidth,
									[styles.wide]: bigger,
									"pt-8-forced": showLeaderboard,
								},
								className,
							)
				}
				style={style}
			>
				{children}
			</main>
		</div>
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
