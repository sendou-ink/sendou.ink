import clsx from "clsx";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { specialWeaponImageUrl, stageBannerImageUrl } from "~/utils/urls";
import { ModeImage } from "../Image";
import styles from "./MatchBanner.module.css";

interface BannerHost {
	name: string;
	avatarUrl?: string;
}

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
	joinPass?: string | null;
	host?: BannerHost | null;
	children?: React.ReactNode;
}

export function MatchBanner({
	stageId,
	mode,
	screenLegal,
	joinPool,
	joinPass,
	host,
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

			{joinPool ? (
				<JoinInfo pool={joinPool} pass={joinPass} host={host} />
			) : null}
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
	joinPass?: string | null;
	host?: BannerHost | null;
	topRight?: React.ReactNode;
	testId?: string;
}

export function IconBanner({
	icon,
	header,
	subtitle,
	screenLegal,
	joinPool,
	joinPass,
	host,
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
			{joinPool ? (
				<JoinInfo pool={joinPool} pass={joinPass} host={host} />
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

function JoinInfo({
	pool,
	pass,
	host,
}: {
	pool: string;
	pass?: string | null;
	host?: BannerHost | null;
}) {
	const { t } = useTranslation(["q", "common"]);

	return (
		<div className={styles.joinInfo}>
			<div className={styles.joinInfoItem}>
				<div className={styles.joinInfoLabel}>{t("q:match.pool")}</div>
				<div className={styles.joinInfoValue}>{pool}</div>
			</div>
			{pass ? (
				<div className={styles.joinInfoItem}>
					<div className={styles.joinInfoLabel}>
						{t("q:match.password.short")}
					</div>
					<div className={styles.joinInfoValue} data-testid="room-pass">
						{pass}
					</div>
				</div>
			) : null}
			{host ? (
				<div className={styles.joinInfoItem}>
					<div className={styles.joinInfoLabel}>{t("common:host")}</div>
					<div className={styles.joinInfoValue}>
						<Avatar
							url={host.avatarUrl}
							identiconInput={host.name}
							size="xxs"
							title={host.name}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

function ScreenNotice({ screenLegal }: { screenLegal: boolean }) {
	const { t } = useTranslation(["weapons", "q"]);

	const imgSize = 24;

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
					<img
						src={`${specialWeaponImageUrl(19)}.avif`}
						width={imgSize}
						height={imgSize}
						alt=""
					/>
					<Icon
						size={imgSize}
						className={screenLegal ? styles.legalIcon : styles.illegalIcon}
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
