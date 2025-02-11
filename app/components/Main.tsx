import { isRouteErrorResponse, useRouteError } from "@remix-run/react";
import clsx from "clsx";
import type * as React from "react";
import { useUser } from "~/features/auth/core/user";

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
	const user = useUser();
	const showLeaderboard =
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
		!user?.patronTier &&
		!isRouteErrorResponse(error);

	return (
		<div className="layout__main-container">
			<main
				className={
					classNameOverwrite
						? clsx(classNameOverwrite, {
								[containerClassName("narrow")]: halfWidth,
								"pt-8-forced": showLeaderboard,
							})
						: clsx(
								"layout__main",
								containerClassName("normal"),
								{
									[containerClassName("narrow")]: halfWidth,
									[containerClassName("wide")]: bigger,
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

export const containerClassName = (width: "narrow" | "normal" | "wide") => {
	if (width === "narrow") {
		return "half-width";
	}

	if (width === "wide") {
		return "bigger";
	}

	return "main";
};
