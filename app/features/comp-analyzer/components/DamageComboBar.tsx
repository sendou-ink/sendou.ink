import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, WeaponImage } from "~/components/Image";
import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	abilityImageUrl,
	specialWeaponImageUrl,
	subWeaponImageUrl,
} from "~/utils/urls";
import { useTargetResAp, useTargetSubDefenseAp } from "../comp-analyzer-hooks";
import type { DamageCombo, DamageSegment } from "../comp-analyzer-types";
import {
	calculateDamageCombos,
	calculateInkTimeToKill,
	type ExcludedDamageKey,
} from "../core/damage-combinations";
import styles from "./DamageComboBar.module.css";

function filterKeyToString(key: ExcludedDamageKey): string {
	return `${key.weaponId}-${key.weaponType}-${key.damageType}`;
}

function weaponTypeFromSegment(
	segment: DamageSegment,
): "main" | "sub" | "special" {
	if (segment.isSubWeapon) return "sub";
	if (segment.isSpecialWeapon) return "special";
	return "main";
}

const SLOT_COLORS = ["yellow", "pink", "green", "blue"] as const;
const LETHAL_DAMAGE = 100;

interface DamageComboBarProps {
	combo: DamageCombo;
	inkTimeFrames: number | null;
	onToggleFilter: (key: ExcludedDamageKey) => void;
}

function DamageComboBar({
	combo,
	inkTimeFrames,
	onToggleFilter,
}: DamageComboBarProps) {
	const { t } = useTranslation(["analyzer", "weapons"]);

	const thresholdPosition = (LETHAL_DAMAGE / combo.totalDamage) * 100;
	const inkDamage = inkTimeFrames ? LETHAL_DAMAGE - combo.totalDamage : 0;
	const totalWithInk = inkTimeFrames
		? LETHAL_DAMAGE
		: Math.max(combo.totalDamage, LETHAL_DAMAGE);

	return (
		<div className={styles.comboRow}>
			<div className={styles.barSection}>
				{inkTimeFrames ? (
					<InkTimeSegment
						inkDamage={inkDamage}
						totalDamage={totalWithInk}
						inkTimeFrames={inkTimeFrames}
					/>
				) : null}
				{combo.segments.map((segment, index) => (
					<SegmentBar
						key={index}
						segment={segment}
						totalDamage={totalWithInk}
						damageTypeLabel={t(`analyzer:damage.${segment.damageType}` as any)}
						onToggleFilter={onToggleFilter}
					/>
				))}
				{thresholdPosition < 100 && !inkTimeFrames ? (
					<div
						className={styles.thresholdLine}
						style={{ left: `${thresholdPosition}%` }}
					/>
				) : null}
			</div>
			<div className={styles.totalSection}>
				<span className={styles.totalDamage}>
					{combo.totalDamage.toFixed(1)}
				</span>
				<span className={styles.hitCount}>
					{t("analyzer:comp.hits", { count: combo.hitCount })}
				</span>
			</div>
		</div>
	);
}

interface SegmentBarProps {
	segment: DamageSegment;
	totalDamage: number;
	damageTypeLabel: string;
	onToggleFilter: (key: ExcludedDamageKey) => void;
}

function SegmentBar({
	segment,
	totalDamage,
	damageTypeLabel,
	onToggleFilter,
}: SegmentBarProps) {
	const segmentDamage = segment.damageValue * segment.count;
	const widthPercent = (segmentDamage / totalDamage) * 100;
	const slotColor = SLOT_COLORS[segment.weaponSlot] ?? "yellow";
	const params = mainWeaponParams(segment.weaponId);

	const handleFilterClick = () => {
		onToggleFilter({
			weaponId: segment.weaponId,
			weaponType: weaponTypeFromSegment(segment),
			damageType: segment.damageType,
		});
	};

	return (
		<div
			className={styles.segmentWrapper}
			style={{ width: `${widthPercent}%` }}
		>
			<div className={styles.segment} data-slot-color={slotColor}>
				<WeaponIcon
					weaponId={segment.weaponId}
					isSubWeapon={segment.isSubWeapon}
					isSpecialWeapon={segment.isSpecialWeapon}
					subWeaponId={params.subWeaponId}
					specialWeaponId={params.specialWeaponId}
				/>
				<span className={styles.damageValue}>{segment.damageValue}</span>
			</div>
			<button
				type="button"
				className={styles.damageTypeLabel}
				onClick={handleFilterClick}
			>
				{damageTypeLabel}
			</button>
		</div>
	);
}

interface InkTimeSegmentProps {
	inkDamage: number;
	totalDamage: number;
	inkTimeFrames: number;
}

function InkTimeSegment({
	inkDamage,
	totalDamage,
	inkTimeFrames,
}: InkTimeSegmentProps) {
	const widthPercent = (inkDamage / totalDamage) * 100;

	return (
		<div
			className={styles.segmentWrapper}
			style={{ width: `${widthPercent}%` }}
		>
			<div className={styles.inkTimeSegment}>
				<Image path={abilityImageUrl("RES")} alt="" size={18} />
				<span className={styles.inkTimeDamage}>{inkDamage.toFixed(1)}</span>
			</div>
			<div className={styles.inkTimeLabel}>{inkTimeFrames}f</div>
		</div>
	);
}

interface WeaponIconProps {
	weaponId: MainWeaponId;
	isSubWeapon: boolean;
	isSpecialWeapon: boolean;
	subWeaponId: SubWeaponId;
	specialWeaponId: SpecialWeaponId;
}

function WeaponIcon({
	weaponId,
	isSubWeapon,
	isSpecialWeapon,
	subWeaponId,
	specialWeaponId,
}: WeaponIconProps) {
	if (isSubWeapon) {
		return (
			<Image
				path={subWeaponImageUrl(subWeaponId)}
				alt=""
				size={18}
				className={styles.subSpecialWeaponIcon}
			/>
		);
	}

	if (isSpecialWeapon) {
		return (
			<Image
				path={specialWeaponImageUrl(specialWeaponId)}
				alt=""
				size={18}
				className={styles.subSpecialWeaponIcon}
			/>
		);
	}

	return (
		<WeaponImage
			weaponSplId={weaponId}
			variant="build"
			size={24}
			className={styles.weaponIcon}
		/>
	);
}

interface FilteredItemProps {
	filterKey: ExcludedDamageKey;
	onRestore: (key: ExcludedDamageKey) => void;
}

function FilteredItem({ filterKey, onRestore }: FilteredItemProps) {
	const { t } = useTranslation(["analyzer", "weapons"]);
	const params = mainWeaponParams(filterKey.weaponId);

	return (
		<button
			type="button"
			className={styles.filteredItem}
			onClick={() => onRestore(filterKey)}
		>
			<WeaponIcon
				weaponId={filterKey.weaponId}
				isSubWeapon={filterKey.weaponType === "sub"}
				isSpecialWeapon={filterKey.weaponType === "special"}
				subWeaponId={params.subWeaponId}
				specialWeaponId={params.specialWeaponId}
			/>
			<span>{t(`analyzer:damage.${filterKey.damageType}` as any)}</span>
		</button>
	);
}

interface DamageComboListProps {
	weaponIds: MainWeaponId[];
}

export function DamageComboList({ weaponIds }: DamageComboListProps) {
	const { t } = useTranslation(["analyzer"]);
	const [excludedKeys, setExcludedKeys] = useState<ExcludedDamageKey[]>([]);
	const [targetResAp, setTargetResAp] = useTargetResAp();
	const [targetSubDefenseAp, setTargetSubDefenseAp] = useTargetSubDefenseAp();
	const [isCollapsed, setIsCollapsed] = useState(false);

	const combos = calculateDamageCombos(
		weaponIds,
		excludedKeys,
		targetSubDefenseAp,
	);

	if (weaponIds.length < 2) {
		return null;
	}

	const handleToggleFilter = (key: ExcludedDamageKey) => {
		const keyString = filterKeyToString(key);
		const exists = excludedKeys.some((k) => filterKeyToString(k) === keyString);

		if (exists) {
			setExcludedKeys(
				excludedKeys.filter((k) => filterKeyToString(k) !== keyString),
			);
		} else {
			setExcludedKeys([...excludedKeys, key]);
		}
	};

	return (
		<div className={styles.container} data-testid="damage-combo-list">
			<button
				type="button"
				className={styles.header}
				onClick={() => setIsCollapsed(!isCollapsed)}
				data-testid="damage-combo-toggle"
			>
				<span className={styles.headerTitle}>
					{t("analyzer:comp.damageCombos")}
				</span>
				<span className={styles.collapseIcon}>{isCollapsed ? "+" : "-"}</span>
			</button>
			{isCollapsed ? null : (
				<div className={styles.content}>
					<div className={styles.slidersContainer}>
						<Image path={abilityImageUrl("SRU")} alt="" size={24} />
						<label className={styles.resSliderLabel}>
							{t("analyzer:comp.enemySubDef")}
						</label>
						<input
							type="range"
							min={0}
							max={MAX_AP}
							value={targetSubDefenseAp}
							onChange={(e) => setTargetSubDefenseAp(Number(e.target.value))}
							className={styles.resSlider}
						/>
						<span className={styles.resSliderValue}>
							{targetSubDefenseAp} AP
						</span>
						<Image path={abilityImageUrl("RES")} alt="" size={24} />
						<label className={styles.resSliderLabel}>
							{t("analyzer:comp.enemyRes")}
						</label>
						<input
							type="range"
							min={0}
							max={MAX_AP}
							value={targetResAp}
							onChange={(e) => setTargetResAp(Number(e.target.value))}
							className={styles.resSlider}
						/>
						<span className={styles.resSliderValue}>{targetResAp} AP</span>
					</div>
					{excludedKeys.length > 0 ? (
						<div className={styles.filteredItemsRow}>
							{excludedKeys.map((key) => (
								<FilteredItem
									key={filterKeyToString(key)}
									filterKey={key}
									onRestore={handleToggleFilter}
								/>
							))}
						</div>
					) : null}
					{combos.map((combo, index) => {
						const inkTimeFrames = calculateInkTimeToKill(
							combo.totalDamage,
							targetResAp,
						);
						if (combo.totalDamage < 100 && inkTimeFrames === null) {
							return null;
						}
						return (
							<DamageComboBar
								key={index}
								combo={combo}
								inkTimeFrames={inkTimeFrames}
								onToggleFilter={handleToggleFilter}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}
