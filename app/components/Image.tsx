import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { TierName } from "~/features/mmr/mmr-constants";
import type {
	MainWeaponId,
	ModeShortWithSpecial,
	SpecialWeaponId,
	StageId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	mainWeaponImageUrl,
	modeImageUrl,
	outlinedFiveStarMainWeaponImageUrl,
	outlinedMainWeaponImageUrl,
	outlinedTenStarMainWeaponImageUrl,
	specialWeaponDetailImageUrl,
	specialWeaponHighlightImageUrl,
	specialWeaponImageUrl,
	stageImageUrl,
	subWeaponDetailImageUrl,
	subWeaponHighlightImageUrl,
	subWeaponImageUrl,
	TIER_PLUS_URL,
	tierImageUrl,
} from "~/utils/urls";
import styles from "./Image.module.css";

interface ImageProps {
	path: string;
	alt: string;
	title?: string;
	className?: string;
	containerClassName?: string;
	width?: number;
	height?: number;
	size?: number;
	style?: React.CSSProperties;
	containerStyle?: React.CSSProperties;
	testId?: string;
	onClick?: () => void;
	loading?: "lazy" | "eager";
}

export function Image({
	path,
	alt,
	title,
	className,
	width,
	height,
	size,
	style,
	testId,
	containerClassName,
	containerStyle,
	onClick,
	loading = "lazy",
}: ImageProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Biome v2 migration
		<div
			title={title}
			className={containerClassName}
			style={containerStyle}
			onClick={onClick}
		>
			<img
				alt={alt}
				src={`${path}.avif`}
				className={className}
				width={size ?? width}
				height={size ?? height}
				style={style}
				draggable="false"
				loading={loading}
				data-testid={testId}
			/>
		</div>
	);
}

type WeaponWithStars = {
	weaponSplId: MainWeaponId;
	isFavorite?: boolean | number;
	isTenStar?: boolean | number;
};

type WeaponImageProps = (
	| { weaponSplId: MainWeaponId; weapon?: never }
	| { weapon: WeaponWithStars; weaponSplId?: never }
) & {
	variant?: "badge" | "badge-5-star" | "badge-10-star" | "build";
} & Omit<ImageProps, "path" | "alt">;

function resolveWeaponBadgeVariant(weapon: WeaponWithStars) {
	if (weapon.isFavorite && weapon.isTenStar) return "badge-10-star" as const;
	if (weapon.isFavorite) return "badge-5-star" as const;
	return "badge" as const;
}

export function WeaponImage({
	weaponSplId: weaponSplIdProp,
	weapon,
	variant: variantProp,
	testId,
	title,
	...rest
}: WeaponImageProps) {
	const { t } = useTranslation(["weapons"]);

	const weaponSplId = weapon?.weaponSplId ?? weaponSplIdProp!;
	const variant =
		variantProp ?? (weapon ? resolveWeaponBadgeVariant(weapon) : "badge");

	return (
		<Image
			{...rest}
			alt={title ?? t(`weapons:MAIN_${weaponSplId}`)}
			title={title ?? t(`weapons:MAIN_${weaponSplId}`)}
			testId={testId}
			path={
				variant === "badge"
					? outlinedMainWeaponImageUrl(weaponSplId)
					: variant === "badge-5-star"
						? outlinedFiveStarMainWeaponImageUrl(weaponSplId)
						: variant === "badge-10-star"
							? outlinedTenStarMainWeaponImageUrl(weaponSplId)
							: mainWeaponImageUrl(weaponSplId)
			}
		/>
	);
}

type ModeImageProps = {
	mode: ModeShortWithSpecial;
} & Omit<ImageProps, "path" | "alt">;

export function ModeImage({ mode, testId, title, ...rest }: ModeImageProps) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<Image
			{...rest}
			alt={title ?? t(`game-misc:MODE_LONG_${mode}`)}
			title={title ?? t(`game-misc:MODE_LONG_${mode}`)}
			testId={testId}
			path={modeImageUrl(mode)}
		/>
	);
}

type StageImageProps = {
	stageId: StageId;
} & Omit<ImageProps, "path" | "alt" | "title">;

export function StageImage({ stageId, testId, ...rest }: StageImageProps) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<Image
			{...rest}
			alt={t(`game-misc:STAGE_${stageId}`)}
			title={t(`game-misc:STAGE_${stageId}`)}
			testId={testId}
			path={stageImageUrl(stageId)}
			height={rest.height ?? (rest.width ? rest.width * 0.5625 : undefined)}
		/>
	);
}

type SubWeaponImageProps = {
	subWeaponId: SubWeaponId;
	alt?: string;
} & Omit<ImageProps, "path" | "alt" | "title">;

export function SubWeaponImage({
	subWeaponId,
	alt,
	testId,
	...rest
}: SubWeaponImageProps) {
	const { t } = useTranslation(["weapons"]);

	const name = alt ?? t(`weapons:SUB_${subWeaponId}`);

	return (
		<InkTintedImage
			{...rest}
			alt={name}
			title={name || undefined}
			testId={testId}
			path={subWeaponImageUrl(subWeaponId)}
			detailPath={subWeaponDetailImageUrl(subWeaponId)}
			highlightPath={subWeaponHighlightImageUrl(subWeaponId)}
		/>
	);
}

type SpecialWeaponImageProps = {
	specialWeaponId: SpecialWeaponId;
	alt?: string;
} & Omit<ImageProps, "path" | "alt" | "title">;

export function SpecialWeaponImage({
	specialWeaponId,
	alt,
	testId,
	...rest
}: SpecialWeaponImageProps) {
	const { t } = useTranslation(["weapons"]);

	const name = alt ?? t(`weapons:SPECIAL_${specialWeaponId}`);

	return (
		<InkTintedImage
			{...rest}
			alt={name}
			title={name || undefined}
			testId={testId}
			path={specialWeaponImageUrl(specialWeaponId)}
			detailPath={specialWeaponDetailImageUrl(specialWeaponId)}
			highlightPath={specialWeaponHighlightImageUrl(specialWeaponId)}
		/>
	);
}

type InkTintedImageProps = {
	/** Icon whose alpha channel is the silhouette to fill with the accent color. */
	path: string;
	/** Overlay holding the teal parts of the icon. */
	detailPath: string;
	/** Mask of the white parts of the icon, painted in the text color. */
	highlightPath: string;
} & Omit<ImageProps, "path" | "onClick" | "loading">;

function InkTintedImage({
	path,
	detailPath,
	highlightPath,
	alt,
	title,
	className,
	containerClassName,
	containerStyle,
	width,
	height,
	size,
	style,
	testId,
}: InkTintedImageProps) {
	return (
		<div title={title} className={containerClassName} style={containerStyle}>
			<span
				role="img"
				aria-label={alt}
				data-testid={testId}
				className={clsx(styles.inkTinted, className)}
				style={
					{
						...style,
						width: size ?? width,
						height: size ?? height,
						"--ink-silhouette": `url("${path}.avif")`,
						"--ink-detail": `url("${detailPath}.avif")`,
						"--ink-highlight": `url("${highlightPath}.avif")`,
					} as React.CSSProperties
				}
			>
				<span className={styles.inkArt} />
				<span className={styles.inkHighlight} />
			</span>
		</div>
	);
}

/** Image with the same subtle outline sub and special weapon icons have, so light art stays visible on light backgrounds. */
export function OutlinedImage({
	path,
	alt,
	title,
	className,
	containerClassName,
	containerStyle,
	width,
	height,
	size,
	style,
	testId,
}: Omit<ImageProps, "onClick" | "loading">) {
	return (
		<div title={title} className={containerClassName} style={containerStyle}>
			<span
				role="img"
				aria-label={alt}
				data-testid={testId}
				className={clsx(styles.inkTinted, className)}
				style={
					{
						...style,
						width: size ?? width,
						height: size ?? height,
						"--ink-silhouette": `url("${path}.avif")`,
					} as React.CSSProperties
				}
			>
				<span className={styles.outlinedArt} />
			</span>
		</div>
	);
}

type TierImageProps = {
	tier: { name: TierName; isPlus: boolean };
} & Omit<ImageProps, "path" | "alt" | "title" | "size" | "height">;

export function TierImage({ tier, className, width = 200 }: TierImageProps) {
	const title = `${tier.name}${tier.isPlus ? "+" : ""}`;

	const height = width * 0.8675;

	return (
		<div className={clsx(styles.tierContainer, className)} style={{ width }}>
			<Image
				path={tierImageUrl(tier.name)}
				width={width}
				height={height}
				alt={title}
				title={title}
				containerClassName={styles.tierImg}
			/>
			{tier.isPlus ? (
				<Image
					path={TIER_PLUS_URL}
					width={width}
					height={height}
					alt={title}
					title={title}
					containerClassName={styles.tierImg}
				/>
			) : null}
		</div>
	);
}
