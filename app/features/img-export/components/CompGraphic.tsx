import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
	Image,
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import {
	LETHAL_DAMAGE,
	SPECIAL_WEAPON_CATEGORIES,
	SUB_WEAPON_CATEGORIES,
} from "~/features/comp-analyzer/comp-analyzer-constants";
import type {
	DamageCombo,
	DamageSegment,
} from "~/features/comp-analyzer/comp-analyzer-types";
import { getWeaponsWithRange } from "~/features/comp-analyzer/core/weapon-range";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { COMP_ANALYZER_URL, navIconUrl } from "~/utils/urls";
import styles from "./CompGraphic.module.css";
import {
	GraphicContainer,
	GraphicFooter,
	GraphicHeader,
	GraphicSectionDivider,
	GraphicSiteUrl,
	GraphicTitle,
} from "./Graphic";

const COMP_GRAPHIC_WIDTH = 600;
const MAX_COMBOS = 5;
/** Same scale as the analyzer's trajectory chart */
const RANGE_CHART_MAX = 32;

export function CompGraphic({
	weaponIds,
	combos,
	title,
	showRanges = true,
	showCombos = true,
}: {
	weaponIds: MainWeaponId[];
	/** Without a title the whole header is left out */
	title?: string;
	/** Damage combos in the order the analyzer shows them, only the top ones get rendered */
	combos: DamageCombo[];
	showRanges?: boolean;
	showCombos?: boolean;
}) {
	const { t } = useTranslation(["analyzer"]);

	const weaponsWithRange = getWeaponsWithRange(weaponIds);
	const topCombos = combos.slice(0, MAX_COMBOS);

	return (
		<GraphicContainer width={COMP_GRAPHIC_WIDTH}>
			{title ? (
				<GraphicHeader
					leading={
						<Image path={navIconUrl("comp-analyzer")} alt="" size={44} />
					}
					titleRow={<GraphicTitle>{title}</GraphicTitle>}
					subtitle={
						<div className={styles.subtitle}>
							{t("analyzer:comp.graphicSubtitle")}
						</div>
					}
				/>
			) : null}
			<div className={styles.weaponsList}>
				{weaponIds.map((weaponId, slot) => (
					<WeaponRow
						key={`${weaponId}-${slot}`}
						weaponId={weaponId}
						slot={slot}
					/>
				))}
			</div>
			{showRanges && weaponsWithRange.length > 0 ? (
				<>
					<GraphicSectionDivider>
						{t("analyzer:comp.weaponRanges")}
					</GraphicSectionDivider>
					<RangeChart weapons={weaponsWithRange} />
				</>
			) : null}
			{showCombos && topCombos.length > 0 ? (
				<>
					<GraphicSectionDivider>
						{t("analyzer:comp.damageCombos")}
					</GraphicSectionDivider>
					<div className={styles.combosList}>
						{topCombos.map((combo, index) => (
							<ComboRow key={index} combo={combo} />
						))}
					</div>
				</>
			) : null}
			<GraphicFooter>
				<GraphicSiteUrl path={COMP_ANALYZER_URL} />
			</GraphicFooter>
		</GraphicContainer>
	);
}

function WeaponRow({
	weaponId,
	slot,
}: {
	weaponId: MainWeaponId;
	slot: number;
}) {
	const { t } = useTranslation(["weapons", "analyzer"]);

	const params = mainWeaponParams(weaponId);
	const subCategory = SUB_WEAPON_CATEGORIES[params.subWeaponId];
	const specialCategory = SPECIAL_WEAPON_CATEGORIES[params.specialWeaponId];

	return (
		<div className={clsx(styles.weaponRow, styles.slot)} data-slot={slot}>
			<div className={styles.weaponBadge}>
				<WeaponImage weaponSplId={weaponId} variant="badge" size={44} />
			</div>
			<div className={styles.weaponInfo}>
				<div className={styles.weaponName}>{t(`weapons:MAIN_${weaponId}`)}</div>
				<div className={styles.weaponRoles}>
					<span>{t(`analyzer:comp.subCategory.${subCategory}`)}</span>
					<span className={styles.weaponRoleSeparator}>·</span>
					<span>{t(`analyzer:comp.specialCategory.${specialCategory}`)}</span>
				</div>
			</div>
			<div className={styles.kit}>
				<SubWeaponImage subWeaponId={params.subWeaponId} size={26} />
				<SpecialWeaponImage
					specialWeaponId={params.specialWeaponId}
					size={26}
				/>
			</div>
		</div>
	);
}

function RangeChart({
	weapons,
}: {
	weapons: Array<{
		weaponId: MainWeaponId;
		range: number;
		blastRadius?: number;
		slot: number;
	}>;
}) {
	return (
		<div className={styles.rangeChart}>
			{weapons.map((weapon) => (
				<div
					key={`${weapon.weaponId}-${weapon.slot}`}
					className={styles.rangeRow}
				>
					<WeaponImage
						weaponSplId={weapon.weaponId}
						variant="build"
						size={28}
					/>
					<div className={styles.rangeTrack}>
						<div
							className={clsx(styles.rangeBar, styles.slot, {
								[styles.rangeBarWithBlast]: Boolean(weapon.blastRadius),
							})}
							data-slot={weapon.slot}
							style={{ width: rangePercentage(weapon.range) }}
						/>
						{weapon.blastRadius ? (
							<div
								className={clsx(styles.rangeBlast, styles.slot)}
								data-slot={weapon.slot}
								style={{
									left: rangePercentage(weapon.range),
									width: rangePercentage(weapon.blastRadius),
								}}
							/>
						) : null}
					</div>
					<div className={styles.rangeValue}>{weapon.range.toFixed(1)}</div>
				</div>
			))}
		</div>
	);
}

function ComboRow({ combo }: { combo: DamageCombo }) {
	const { t } = useTranslation(["analyzer"]);

	const barTotal = Math.max(combo.totalDamage, LETHAL_DAMAGE);
	const lethalPosition = (LETHAL_DAMAGE / combo.totalDamage) * 100;

	return (
		<div className={styles.comboRow}>
			<div className={styles.comboBar}>
				{combo.segments.map((segment, index) => (
					<ComboSegment key={index} segment={segment} barTotal={barTotal} />
				))}
				{lethalPosition < 100 ? (
					<div
						className={styles.lethalLine}
						style={{ left: `${lethalPosition}%` }}
					/>
				) : null}
			</div>
			<div className={styles.comboTotal}>
				<span
					className={clsx(styles.comboDamage, {
						[styles.comboDamageLethal]: combo.totalDamage >= LETHAL_DAMAGE,
					})}
				>
					{combo.totalDamage.toFixed(1)}
				</span>
				<span className={styles.comboHits}>
					{t("analyzer:comp.hits", { count: combo.hitCount })}
				</span>
			</div>
		</div>
	);
}

function ComboSegment({
	segment,
	barTotal,
}: {
	segment: DamageSegment;
	barTotal: number;
}) {
	const width = ((segment.damageValue * segment.count) / barTotal) * 100;

	return (
		<div
			className={clsx(styles.comboSegment, styles.slot)}
			data-slot={segment.weaponSlot}
			style={{ width: `${width}%` }}
		>
			<SegmentIcon segment={segment} />
			<span className={styles.segmentDamage}>
				{segment.damageValue}
				{segment.count > 1 ? (
					<span className={styles.segmentMultiplier}>×{segment.count}</span>
				) : null}
			</span>
		</div>
	);
}

function SegmentIcon({ segment }: { segment: DamageSegment }) {
	const params = mainWeaponParams(segment.weaponId);

	if (segment.isSubWeapon) {
		return <SubWeaponImage subWeaponId={params.subWeaponId} size={18} />;
	}

	if (segment.isSpecialWeapon) {
		return (
			<SpecialWeaponImage specialWeaponId={params.specialWeaponId} size={18} />
		);
	}

	return (
		<WeaponImage weaponSplId={segment.weaponId} variant="build" size={22} />
	);
}

function rangePercentage(range: number) {
	return `${Math.min(range / RANGE_CHART_MAX, 1) * 100}%`;
}
