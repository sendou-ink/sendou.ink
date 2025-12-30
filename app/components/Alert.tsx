import clsx from "clsx";
import type * as React from "react";
import { assertUnreachable } from "~/utils/types";
import styles from "./Alert.module.css";
import { AlertIcon } from "./icons/Alert";
import { CheckmarkIcon } from "./icons/Checkmark";
import { ErrorIcon } from "./icons/Error";

export type AlertVariation = "INFO" | "WARNING" | "ERROR" | "SUCCESS";

export function Alert({
	children,
	textClassName,
	alertClassName,
	variation = "INFO",
	tiny = false,
}: {
	children: React.ReactNode;
	textClassName?: string;
	alertClassName?: string;
	variation?: AlertVariation;
	tiny?: boolean;
}) {
	return (
		<div
			className={clsx(styles.alert, alertClassName, {
				[styles.tiny]: tiny,
				[styles.warning]: variation === "WARNING",
				[styles.error]: variation === "ERROR",
				[styles.success]: variation === "SUCCESS",
			})}
		>
			<Icon variation={variation} />{" "}
			<div className={textClassName}>{children}</div>
		</div>
	);
}

function Icon({ variation }: { variation: AlertVariation }) {
	switch (variation) {
		case "INFO":
			return <AlertIcon />;
		case "WARNING":
			return <AlertIcon />;
		case "ERROR":
			return <ErrorIcon />;
		case "SUCCESS":
			return <CheckmarkIcon />;
		default:
			assertUnreachable(variation);
	}
}
