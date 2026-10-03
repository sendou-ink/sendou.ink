import clsx from "clsx";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, type LinkProps } from "react-router";
import styles from "./BackLink.module.css";

/** Pill shaped link with a leading arrow, for navigating back up to a parent view. Says "Back" unless given children. */
export function BackLink({
	className,
	children,
	...rest
}: Omit<LinkProps, "className"> & { className?: string }) {
	const { t } = useTranslation(["common"]);

	return (
		<Link {...rest} className={clsx(styles.backLink, className)}>
			<ArrowLeft className={styles.icon} />
			{children ?? t("common:actions.back")}
		</Link>
	);
}
