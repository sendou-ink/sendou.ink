import { useTranslation } from "react-i18next";
import { Image, WeaponImage } from "~/components/Image";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import { specialWeaponImageUrl, subWeaponImageUrl } from "~/utils/urls";
import type { DamageCombo, DamageSegment } from "../comp-analyzer-types";
import styles from "./DamageComboBar.module.css";

const SLOT_COLORS = ["yellow", "pink", "green", "blue"] as const;
const LETHAL_DAMAGE = 100;

interface DamageComboBarProps {
	combo: DamageCombo;
}

function DamageComboBar({ combo }: DamageComboBarProps) {
	const { t } = useTranslation(["analyzer", "weapons"]);

	const thresholdPosition = (LETHAL_DAMAGE / combo.totalDamage) * 100;

	return (
		<div className={styles.comboRow}>
			<div className={styles.barSection}>
				{combo.segments.map((segment, index) => (
					<SegmentBar
						key={index}
						segment={segment}
						totalDamage={combo.totalDamage}
						damageTypeLabel={t(`analyzer:damage.${segment.damageType}` as any)}
					/>
				))}
				{thresholdPosition < 100 ? (
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
}

function SegmentBar({
	segment,
	totalDamage,
	damageTypeLabel,
}: SegmentBarProps) {
	const segmentDamage = segment.damageValue * segment.count;
	const widthPercent = (segmentDamage / totalDamage) * 100;
	const slotColor = SLOT_COLORS[segment.weaponSlot] ?? "yellow";
	const params = mainWeaponParams(segment.weaponId);

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
			<span className={styles.damageTypeLabel}>{damageTypeLabel}</span>
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

interface DamageComboListProps {
	combos: DamageCombo[];
}

export function DamageComboList({ combos }: DamageComboListProps) {
	if (combos.length === 0) {
		return null;
	}

	return (
		<div className={styles.comboList}>
			{combos.map((combo, index) => (
				<DamageComboBar key={index} combo={combo} />
			))}
		</div>
	);
}
