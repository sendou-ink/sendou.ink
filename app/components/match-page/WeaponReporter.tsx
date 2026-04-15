import { useState } from "react";
import { useTranslation } from "react-i18next";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import { SendouButton } from "../elements/Button";
import { Image, ModeImage, StageImage, WeaponImage } from "../Image";
import { WeaponSelect } from "../WeaponSelect";
import styles from "./WeaponReporter.module.css";

interface WeaponReporterMap {
	stageId: StageId;
	mode: ModeShort;
}

export interface WeaponReporterProps {
	maps: WeaponReporterMap[];
	pastReported: MainWeaponId[];
	quickSelectWeaponIds?: MainWeaponId[];
	onSubmit: (weaponSplId: MainWeaponId) => void;
	onUndo: () => void;
	isSubmitting?: boolean;
}

// xxx: default collapsed, small minimal button to uncollapse
// xxx: on sendouq all weapons report different / component tab..? or not? check usage
export function WeaponReporter({
	maps,
	pastReported,
	quickSelectWeaponIds,
	onSubmit,
	onUndo,
	isSubmitting,
}: WeaponReporterProps) {
	const { t } = useTranslation(["q", "game-misc", "common"]);
	const [selectedWeapon, setSelectedWeapon] = useState<MainWeaponId | null>(
		null,
	);

	const inputTargetIndex = pastReported.length;

	const inputTargetMap = maps[inputTargetIndex];
	const unreportedCount =
		maps.length - inputTargetIndex - (inputTargetMap ? 1 : 0);

	return (
		<div className={styles.root}>
			{pastReported.length > 0 ? (
				<div className={styles.pastRow}>
					{pastReported.map((weaponId, i) => (
						<WeaponImage
							key={i}
							weaponSplId={weaponId}
							variant="badge"
							size={24}
						/>
					))}
					<SendouButton
						variant="minimal"
						size="small"
						isDisabled={isSubmitting}
						onPress={onUndo}
					>
						{t("q:match.weapon.undoWeapon")}
					</SendouButton>
				</div>
			) : null}
			{inputTargetMap ? (
				<div className={styles.mapRow}>
					<MapInfo map={inputTargetMap} />
					<div className={styles.inputRow}>
						<div className={styles.weaponSelectContainer}>
							<WeaponSelect
								label={t("q:match.weapon.yourWeapon")}
								value={selectedWeapon}
								onChange={setSelectedWeapon}
								quickSelectWeaponsIds={quickSelectWeaponIds}
							/>
						</div>
						<SendouButton
							variant="primary"
							size="small"
							isDisabled={selectedWeapon === null || isSubmitting}
							onPress={() => {
								if (selectedWeapon === null) return;
								onSubmit(selectedWeapon);
								setSelectedWeapon(null);
							}}
						>
							{t("common:actions.submit")}
						</SendouButton>
					</div>
				</div>
			) : null}
			{unreportedCount > 0 ? (
				<div className={styles.unreportedRow}>
					{Array.from({ length: unreportedCount }, (_, i) => (
						<Image
							key={i}
							path={abilityImageUrl("UNKNOWN")}
							alt="?"
							size={24}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function MapInfo({ map }: { map: WeaponReporterMap }) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className={styles.mapInfo}>
			<StageImage
				stageId={map.stageId}
				width={60}
				className={styles.stageImage}
			/>
			<div className={styles.mapLabel}>
				<ModeImage mode={map.mode} size={14} />
				<span>{shortStageName(t(`game-misc:STAGE_${map.stageId}`))}</span>
			</div>
		</div>
	);
}
