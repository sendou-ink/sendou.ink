import clsx from "clsx";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { specialWeaponImageUrl, stageBannerImageUrl } from "~/utils/urls";
import { ModeImage } from "../Image";
import styles from "./MatchBanner.module.css";

export function MatchBannerContainer({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className={styles.root}>{children}</div>;
}

interface MatchBannerProps {
	stageId: StageId;
	mode: ModeShort;
	screenLegal?: boolean;
	children: React.ReactNode;
}

export function MatchBanner({
	stageId,
	mode,
	screenLegal,
	children,
}: MatchBannerProps) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div
			className={styles.banner}
			style={{
				"--stage-img": `url(${stageBannerImageUrl(stageId)})`,
			}}
			data-testid="stage-banner"
		>
			<div className={clsx(styles.map, styles.thickText)}>
				<ModeImage mode={mode} size={24} />
				{t(`game-misc:MODE_SHORT_${mode}`)} {t(`game-misc:STAGE_${stageId}`)}
			</div>
			<div className={clsx(styles.info, styles.thickText)}>{children}</div>

			{screenLegal !== undefined ? (
				<ScreenNotice screenLegal={screenLegal} />
			) : null}
		</div>
	);
}

export function MultiMatchBanner({ stageIds }: { stageIds: StageId[] }) {
	return (
		<div className={clsx(styles.banner, styles.multiBanner)}>
			{stageIds.map((stageId, i) => (
				<div
					key={`${stageId}-${i}`}
					className={styles.segment}
					style={
						{
							"--stage-img": `url(${stageBannerImageUrl(stageId)})`,
						} as React.CSSProperties
					}
				/>
			))}
		</div>
	);
}

interface IconBannerProps {
	icon: React.ReactNode;
	header: string;
	subtitle?: string;
	screenLegal?: boolean;
	topRight?: React.ReactNode;
	testId?: string;
}

export function IconBanner({
	icon,
	header,
	subtitle,
	screenLegal,
	topRight,
	testId,
}: IconBannerProps) {
	return (
		<div className={styles.iconBanner} data-testid={testId}>
			{icon}
			<div className={styles.iconBannerHeader}>{header}</div>
			{subtitle ? (
				<div className={styles.iconBannerSubtitle}>{subtitle}</div>
			) : null}
			{screenLegal !== undefined ? (
				<ScreenNotice screenLegal={screenLegal} />
			) : null}
			{topRight ? (
				<div className={styles.iconBannerBottomRight}>{topRight}</div>
			) : null}
		</div>
	);
}

function ScreenNotice({ screenLegal }: { screenLegal: boolean }) {
	const { t } = useTranslation(["weapons", "q"]);

	const imgSize = 18;

	const Icon = screenLegal ? Check : X;

	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					className={styles.notice}
					testId={screenLegal ? "screen-allowed" : "screen-banned"}
				>
					<Icon
						size={imgSize}
						className={screenLegal ? styles.legalIcon : styles.illegalIcon}
					/>
					<img
						src={`${specialWeaponImageUrl(19)}.avif`}
						width={imgSize}
						height={imgSize}
						alt=""
					/>
				</SendouButton>
			}
		>
			{screenLegal
				? t("q:match.screen.allowed", {
						special: t("weapons:SPECIAL_19"),
					})
				: t("q:match.screen.ban", {
						special: t("weapons:SPECIAL_19"),
					})}
		</SendouPopover>
	);
}
