import clsx from "clsx";
import { Check, QrCode, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
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
	joinPool?: string | null;
	joinViaQr?: boolean;
	children?: React.ReactNode;
}

export function MatchBanner({
	stageId,
	mode,
	screenLegal,
	joinPool,
	joinViaQr,
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

			{joinPool ? <JoinPoolBadge pool={joinPool} viaQr={joinViaQr} /> : null}
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
	joinPool?: string | null;
	joinViaQr?: boolean;
	topRight?: React.ReactNode;
	testId?: string;
}

export function IconBanner({
	icon,
	header,
	subtitle,
	screenLegal,
	joinPool,
	joinViaQr,
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
			{joinPool ? <JoinPoolBadge pool={joinPool} viaQr={joinViaQr} /> : null}
			{screenLegal !== undefined ? (
				<ScreenNotice screenLegal={screenLegal} />
			) : null}
			{topRight ? (
				<div className={styles.iconBannerBottomRight}>{topRight}</div>
			) : null}
		</div>
	);
}

function JoinPoolBadge({ pool, viaQr }: { pool: string; viaQr?: boolean }) {
	const { t } = useTranslation(["q"]);
	const [, setSearchParams] = useSearchParams();

	return (
		<SendouButton
			variant="minimal"
			className={styles.joinBadge}
			onPress={() =>
				setSearchParams(
					{ tab: "join" },
					{
						preventScrollReset: true,
						defaultShouldRevalidate: false,
					},
				)
			}
			aria-label={t("q:match.pool")}
			testId="join-pool-badge"
		>
			{viaQr ? <QrCode size={18} /> : pool}
		</SendouButton>
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
					aria-label={screenLegal ? "Screen allowed" : "Screen banned"}
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
