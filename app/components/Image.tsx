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
	specialWeaponImageUrl,
	stageImageUrl,
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
	loading?: "lazy";
	forcePng?: boolean;
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
	loading,
	forcePng,
}: ImageProps) {
	if (forcePng) {
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
					src={`${path}.png`}
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

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Biome v2 migration
		<picture
			title={title}
			className={containerClassName}
			style={containerStyle}
			onClick={onClick}
		>
			<source
				type="image/avif"
				srcSet={`${path}.avif`}
				width={width}
				height={height}
				style={style}
			/>
			<img
				alt={alt}
				src={`${path}.png`}
				className={className}
				width={size ?? width}
				height={size ?? height}
				style={style}
				draggable="false"
				loading={loading}
				data-testid={testId}
			/>
		</picture>
	);
}

type WeaponImageProps = {
	weaponSplId: MainWeaponId;
	variant: "badge" | "badge-5-star" | "build";
} & Omit<ImageProps, "path" | "alt">;

export function WeaponImage({
	weaponSplId,
	variant,
	testId,
	title,
	...rest
}: WeaponImageProps) {
	const { t } = useTranslation(["weapons"]);

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
} & Omit<ImageProps, "path" | "alt" | "title">;

export function SubWeaponImage({
	subWeaponId,
	testId,
	...rest
}: SubWeaponImageProps) {
	const { t } = useTranslation(["weapons"]);

	return (
		<Image
			{...rest}
			alt={t(`weapons:SUB_${subWeaponId}`)}
			title={t(`weapons:SUB_${subWeaponId}`)}
			testId={testId}
			path={subWeaponImageUrl(subWeaponId)}
		/>
	);
}

type SpecialWeaponImageProps = {
	specialWeaponId: SpecialWeaponId;
} & Omit<ImageProps, "path" | "alt" | "title">;

export function SpecialWeaponImage({
	specialWeaponId,
	testId,
	...rest
}: SpecialWeaponImageProps) {
	const { t } = useTranslation(["weapons"]);

	return (
		<Image
			{...rest}
			alt={t(`weapons:SPECIAL_${specialWeaponId}`)}
			title={t(`weapons:SPECIAL_${specialWeaponId}`)}
			testId={testId}
			path={specialWeaponImageUrl(specialWeaponId)}
		/>
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
