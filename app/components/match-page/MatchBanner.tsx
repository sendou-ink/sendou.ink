import clsx from "clsx";
import { Check, X } from "lucide-react";
import { ViewTransition } from "react";
import { preload } from "react-dom";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import {
	SendouButton,
	type SendouButtonProps,
} from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { SPLATTERCOLOR_SCREEN_ID } from "~/modules/in-game-lists/weapon-ids";
import { stageBannerImageUrl } from "~/utils/urls";
import { ModeImage, SpecialWeaponImage } from "../Image";
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
		// keyed so a map change makes a share pair; default="none" so other
		// re-renders (score reports, timer ticks) start no transition
		<ViewTransition
			key={`${mode}-${stageId}`}
			name="match-stage-banner"
			share="stage-banner-swap"
			default="none"
		>
			<div
				className={styles.banner}
				style={{
					"--stage-img": `url(${stageBannerImageUrl(stageId)})`,
				}}
				data-testid="stage-banner"
			>
				<ViewTransition
					name="match-stage-banner-map"
					share="stage-banner-text reduced-motion-safe"
					default="none"
				>
					<div
						className={clsx(styles.map, styles.thickText)}
						data-testid={`banner-map-${mode}-${stageId}`}
					>
						<ModeImage mode={mode} size={24} />
						{t(`game-misc:MODE_SHORT_${mode}`)}{" "}
						{t(`game-misc:STAGE_${stageId}`)}
					</div>
				</ViewTransition>
				<ViewTransition
					name="match-stage-banner-info"
					share="stage-banner-text reduced-motion-safe"
					default="none"
				>
					<div className={clsx(styles.info, styles.thickText)}>{children}</div>
				</ViewTransition>

				{joinPool ? (
					<ViewTransition
						name="match-stage-banner-join"
						share="stage-banner-static"
						default="none"
					>
						<JoinInfo pool={joinPool} pass={joinPass} host={host} />
					</ViewTransition>
				) : null}
				{screenLegal !== undefined ? (
					<ViewTransition
						name="match-stage-banner-notice"
						share="stage-banner-static"
						default="none"
					>
						<ScreenNotice screenLegal={screenLegal} />
					</ViewTransition>
				) : null}
			</div>
		</ViewTransition>
	);
}

/** Warms the cache with the remaining maps' banners so the transition to the next one has its image. */
export function preloadStageBanners(stageIds: StageId[]) {
	for (const stageId of new Set(stageIds)) {
		preload(stageBannerImageUrl(stageId), {
			as: "image",
			fetchPriority: "low",
		});
	}
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
					<SpecialWeaponImage
						specialWeaponId={SPLATTERCOLOR_SCREEN_ID}
						size={imgSize}
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

/** Trigger for the small popovers on a banner's info row, e.g. who voted for the map. */
export function MatchBannerInfoBadge({
	children,
	...rest
}: {
	children: React.ReactNode;
} & SendouButtonProps) {
	return (
		<SendouButton variant="minimal" className={styles.infoBadge} {...rest}>
			{children}
		</SendouButton>
	);
}
