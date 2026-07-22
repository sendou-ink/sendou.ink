import clsx from "clsx";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { trophyPage } from "~/utils/urls";
import { Trophy } from "./Trophy";
import styles from "./TrophyShowcase.module.css";

export function TrophyShowcase({
	model,
	children,
	className,
	detailsClassName,
}: {
	model: string;
	children: React.ReactNode;
	className?: string;
	detailsClassName?: string;
}) {
	return (
		<div className={styles.wrapper}>
			<div className={clsx(styles.content, className)}>
				<Trophy model={model} />
				<div className={clsx(styles.details, detailsClassName, "scrollbar")}>
					{children}
				</div>
			</div>
		</div>
	);
}

export function TrophyShowcaseModal({
	trophy,
	onClose,
	children,
}: {
	trophy: { id: number; name: string; model: string };
	onClose: () => void;
	children?: React.ReactNode;
}) {
	const { t } = useTranslation(["trophies"]);

	return (
		<SendouDialog
			isOpen
			onClose={onClose}
			showHeading={false}
			isDismissable
			className={styles.modal}
		>
			<TrophyShowcase model={trophy.model}>
				<div className="stack xxs">
					<p className={styles.trophyName}>{trophy.name}</p>
					<Link to={trophyPage(trophy.id)} className={styles.trophyPageLink}>
						{t("trophies:display.viewTrophyPage")}
					</Link>
				</div>
				{children}
			</TrophyShowcase>
		</SendouDialog>
	);
}
