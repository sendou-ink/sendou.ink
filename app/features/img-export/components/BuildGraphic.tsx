import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { Image, ModeImage, WeaponImage } from "~/components/Image";
import type { Tables } from "~/db/tables";
import type { AbilityPoints } from "~/features/build-analyzer/analyzer-types";
import { buildToAbilityPoints } from "~/features/build-analyzer/core/ability-points";
import { getAbilityChunksMapAsArray } from "~/features/build-analyzer/core/abilityChunksCalc";
import { apFromMap } from "~/features/build-analyzer/core/utils";
import type { BuildWeaponWithTop500Info } from "~/features/builds/builds-types";
import type {
	Ability as AbilityType,
	BuildAbilitiesTuple,
	GearType,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { gearImageUrl, navIconUrl, resolveAvatarUrl } from "~/utils/urls";
import styles from "./BuildGraphic.module.css";
import {
	GraphicContainer,
	GraphicDateSubtitle,
	GraphicHeader,
	GraphicTitle,
} from "./Graphic";

const BUILD_GRAPHIC_WIDTH = 380;

export interface BuildGraphicOwner {
	username: string;
	discordId: string;
	plusTier: number | null;
	customUrl?: Tables["User"]["customUrl"];
	discordAvatar?: Tables["User"]["discordAvatar"];
	customAvatarUrl?: string | null;
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
	const { t } = useTranslation(["weapons"]);

	const abilityPoints = buildToAbilityPoints(build.abilities);

	const isNoGear = [
		build.headGearSplId,
		build.clothesGearSplId,
		build.shoesGearSplId,
	].some((id) => typeof id !== "number");

	return (
		<GraphicContainer width={BUILD_GRAPHIC_WIDTH}>
			<GraphicHeader
				avatarUrl={resolveAvatarUrl({
					customAvatarUrl: owner.customAvatarUrl,
					discordId: owner.discordId,
					discordAvatar: owner.discordAvatar,
					size: "lg",
				})}
				identiconInput={owner.discordId}
				titleRow={
					<GraphicTitle>
						{owner.username}
						{owner.plusTier ? (
							<span className={styles.plusTier}> +{owner.plusTier}</span>
						) : null}
					</GraphicTitle>
				}
				subtitle={<GraphicDateSubtitle date={build.updatedAt} />}
				trailing={
					build.modes && build.modes.length > 0
						? build.modes.map((mode) => (
								<ModeImage key={mode} mode={mode} size={24} />
							))
						: undefined
				}
				alignTrailingWithTitle
			/>
			{showTitle ? (
				<div className={styles.buildTitle}>{build.title}</div>
			) : null}
			<div className={styles.weaponsRow}>
				{build.weapons.map((weapon) => (
					<div key={weapon.weaponSplId} className={styles.weapon}>
						{weapon.isTop500 ? (
							<Image
								className={styles.top500}
								path={navIconUrl("xsearch")}
								alt=""
								height={26}
								width={26}
							/>
						) : null}
						<WeaponImage
							weaponSplId={weapon.weaponSplId}
							variant="badge"
							size={50}
						/>
					</div>
				))}
				{build.weapons.length === 1 ? (
					<div className={styles.weaponName}>
						{t(`weapons:MAIN_${build.weapons[0].weaponSplId}`)}
					</div>
				) : null}
			</div>
			<div
				className={clsx(styles.gearGrid, {
					[styles.noGear]: isNoGear,
					[styles.noAbilityPoints]: !showAbilityPoints,
				})}
			>
				<GearRow
					gearType="HEAD"
					abilities={build.abilities[0]}
					gearId={build.headGearSplId}
					abilityPoints={showAbilityPoints ? abilityPoints : null}
				/>
				<GearRow
					gearType="CLOTHES"
					abilities={build.abilities[1]}
					gearId={build.clothesGearSplId}
					abilityPoints={showAbilityPoints ? abilityPoints : null}
				/>
				<GearRow
					gearType="SHOES"
					abilities={build.abilities[2]}
					gearId={build.shoesGearSplId}
					abilityPoints={showAbilityPoints ? abilityPoints : null}
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
		<>
			{typeof gearId === "number" ? (
				<Image
					height={80}
					width={80}
					alt=""
					path={gearImageUrl(gearType, gearId)}
					className={styles.gear}
				/>
			) : null}
			<Ability ability={mainAbility} size="HUGE" />
			<div className={styles.subAbilities}>
				{subAbilitySegments(subAbilities).map((segment, segmentIndex) => (
					<div key={segmentIndex} className={styles.subAbilitySegment}>
						<div className={styles.subAbilitySegmentIcons}>
							{Array.from({ length: segment.count }, (_, index) => (
								<Ability key={index} ability={segment.ability} size="MAIN" />
							))}
						</div>
						{abilityPoints ? (
							<div className={styles.abilityPointsLabel}>
								{apFromMap({ abilityPoints, ability: segment.ability })}
								{t("analyzer:abilityPoints.short")}
							</div>
						) : null}
					</div>
				))}
			</div>
		</>
	);
}

function AbilityChunksRow({ abilities }: { abilities: BuildAbilitiesTuple }) {
	const abilityChunks = getAbilityChunksMapAsArray(abilities);

	if (abilityChunks.length === 0) return null;

	return (
		<div className={styles.abilityChunks}>
			{abilityChunks.map(([ability, count]) => (
				<div key={ability} className={styles.abilityChunk}>
					<Ability ability={ability} size="SUB" />
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
