import clsx from "clsx";
import type * as React from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
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
	sideNav?: React.ReactNode;
}) => {
	const error = useRouteError();
	const isMinorSupporter = useHasRole("MINOR_SUPPORT");
	const showLeaderboard =
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
		!isMinorSupporter &&
		!isRouteErrorResponse(error);

	return (
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
