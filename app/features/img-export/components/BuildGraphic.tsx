import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import { Image, WeaponImage } from "~/components/Image";
import type { Tables } from "~/db/tables";
import type { AbilityPoints } from "~/features/build-analyzer/analyzer-types";
import { buildToAbilityPoints } from "~/features/build-analyzer/core/ability-points";
import { getAbilityChunksMapAsArray } from "~/features/build-analyzer/core/abilityChunksCalc";
import { apFromMap } from "~/features/build-analyzer/core/utils";
import type { BuildWeaponWithTop500Info } from "~/features/builds/builds-types";
import * as Patches from "~/features/builds/core/patches";
import type {
	Ability as AbilityType,
	AbilityWithUnknown,
	BuildAbilitiesTuple,
	GearType,
	ModeShort,
} from "~/modules/in-game-lists/types";
import {
	abilityImageUrl,
	gearImageUrl,
	modeImageUrl,
	navIconUrl,
} from "~/utils/urls";
import styles from "./BuildGraphic.module.css";
import { GraphicContainer } from "./Graphic";

const BUILD_GRAPHIC_WIDTH = 380;

export interface BuildGraphicOwner {
	id: number;
	username: string;
	plusTier: number | null;
	customUrl?: Tables["User"]["customUrl"];
	avatar?: string | null;
}

export function BuildGraphic({
	build,
	owner,
	showTitle = true,
	showAbilityPoints = true,
	showAbilityChunks = false,
}: {
	build: Pick<
		Tables["Build"],
		| "title"
		| "description"
		| "clothesGearSplId"
		| "headGearSplId"
		| "shoesGearSplId"
		| "updatedAt"
	> & {
		abilities: BuildAbilitiesTuple;
		modes: ModeShort[] | null;
		weapons: Array<BuildWeaponWithTop500Info>;
	};
	owner: BuildGraphicOwner;
	showTitle?: boolean;
	showAbilityPoints?: boolean;
	showAbilityChunks?: boolean;
}) {
	const { t } = useTranslation(["weapons", "game-misc", "common"]);

	const abilityPoints = showAbilityPoints
		? buildToAbilityPoints(build.abilities)
		: null;
	const patch = Patches.ofTimestamp(build.updatedAt);
	const [mainWeapon, ...otherWeapons] = build.weapons;

	return (
		<GraphicContainer width={BUILD_GRAPHIC_WIDTH} className={styles.container}>
			<div className={styles.bar}>
				{build.modes?.map((mode) => (
					<Image
						key={mode}
						alt=""
						path={modeImageUrl(mode)}
						containerClassName={styles.mode}
						className={styles.modeImage}
					/>
				))}
				{patch ? <div className={styles.patch}>{patch}</div> : null}
			</div>
			<div className={styles.header}>
				<WeaponCircle weapon={mainWeapon} />
				<div className={styles.titleBlock}>
					<div className={styles.title}>
						{showTitle
							? build.title
							: t(`weapons:MAIN_${mainWeapon.weaponSplId}`)}
					</div>
					<div className={styles.owner}>
						<Avatar
							user={{ id: owner.id, avatar: owner.avatar ?? null }}
							size="xxxsm"
							alt=""
						/>
						<span className={styles.username}>{owner.username}</span>
						{owner.plusTier ? (
							<span className={styles.plusTier}>
								<Image
									path={navIconUrl("plus")}
									alt={t("common:pages.plus")}
									size={16}
								/>
								{owner.plusTier}
							</span>
						) : null}
					</div>
					{otherWeapons.length > 0 ? (
						<div className={styles.otherWeapons}>
							{otherWeapons.map((weapon) => (
								<WeaponCircle
									key={weapon.weaponSplId}
									weapon={weapon}
									isSmall
								/>
							))}
						</div>
					) : null}
				</div>
			</div>
			<div
				className={clsx(styles.gearAbilities, {
					[styles.withAbilityPoints]: abilityPoints,
				})}
			>
				<GearRow
					gearType="HEAD"
					abilities={build.abilities[0]}
					gearId={build.headGearSplId}
					abilityPoints={abilityPoints}
				/>
				<GearRow
					gearType="CLOTHES"
					abilities={build.abilities[1]}
					gearId={build.clothesGearSplId}
					abilityPoints={abilityPoints}
				/>
				<GearRow
					gearType="SHOES"
					abilities={build.abilities[2]}
					gearId={build.shoesGearSplId}
					abilityPoints={abilityPoints}
				/>
			</div>
			{showAbilityChunks ? (
				<AbilityChunksRow abilities={build.abilities} />
			) : null}
			{build.description ? (
				<div className={styles.description}>{build.description}</div>
			) : null}
		</GraphicContainer>
	);
}

function WeaponCircle({
	weapon,
	isSmall = false,
}: {
	weapon: BuildWeaponWithTop500Info;
	isSmall?: boolean;
}) {
	return (
		<div className={clsx(styles.weapon, { [styles.weaponSmall]: isSmall })}>
			{weapon.isTop500 ? (
				<Image
					className={styles.top500}
					path={navIconUrl("xsearch")}
					alt=""
					size={isSmall ? 12 : 18}
				/>
			) : null}
			<CircleBackdrop bordered className={styles.weaponBackdrop}>
				<WeaponImage
					weaponSplId={weapon.weaponSplId}
					variant="build"
					size={64}
				/>
			</CircleBackdrop>
		</div>
	);
}

function GearRow({
	gearType,
	abilities,
	gearId,
	abilityPoints,
}: {
	gearType: GearType;
	abilities: AbilityType[];
	gearId: number | null;
	/** When null the ability point labels are hidden */
	abilityPoints: AbilityPoints | null;
}) {
	const { t } = useTranslation(["analyzer"]);

	const [mainAbility, ...subAbilities] = abilities;

	return (
		<div className={styles.gearRow}>
			{typeof gearId === "number" ? (
				<CircleBackdrop bordered className={styles.gearBackdrop}>
					<Image size={64} alt="" path={gearImageUrl(gearType, gearId)} />
				</CircleBackdrop>
			) : null}
			<AbilityIcon ability={mainAbility} isMain />
			{subAbilitySegments(subAbilities).map((segment, segmentIndex) => (
				<div key={segmentIndex} className={styles.subAbilitySegment}>
					{Array.from({ length: segment.count }, (_, index) => (
						<AbilityIcon key={index} ability={segment.ability} />
					))}
					{abilityPoints ? (
						<div className={styles.abilityPointsLabel}>
							{apFromMap({ abilityPoints, ability: segment.ability })}
							{t("analyzer:abilityPoints.short")}
						</div>
					) : null}
				</div>
			))}
		</div>
	);
}

function AbilityIcon({
	ability,
	isMain = false,
	isSmall = false,
}: {
	ability: AbilityWithUnknown;
	isMain?: boolean;
	isSmall?: boolean;
}) {
	return (
		<div
			className={clsx(styles.ability, {
				[styles.abilityMain]: isMain,
				[styles.abilitySmall]: isSmall,
			})}
		>
			<Image
				alt=""
				path={abilityImageUrl(ability)}
				className={styles.abilityImage}
			/>
		</div>
	);
}

function AbilityChunksRow({ abilities }: { abilities: BuildAbilitiesTuple }) {
	const abilityChunks = getAbilityChunksMapAsArray(abilities);

	if (abilityChunks.length === 0) return null;

	return (
		<div className={styles.abilityChunks}>
			{abilityChunks.map(([ability, count]) => (
				<div key={ability} className={styles.abilityChunk}>
					<AbilityIcon ability={ability} isSmall />
					<div className={styles.abilityChunkCount}>{count}</div>
				</div>
			))}
		</div>
	);
}

function subAbilitySegments(subAbilities: AbilityType[]) {
	const segments: Array<{ ability: AbilityType; count: number }> = [];

	for (const ability of subAbilities) {
		const previousSegment = segments.at(-1);
		if (previousSegment?.ability === ability) {
			previousSegment.count++;
		} else {
			segments.push({ ability, count: 1 });
		}
	}

	return segments;
}
