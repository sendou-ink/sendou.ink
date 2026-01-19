import { useTranslation } from "react-i18next";
import { Image, WeaponImage } from "~/components/Image";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	abilityImageUrl,
	specialWeaponImageUrl,
	subWeaponImageUrl,
} from "~/utils/urls";
import { MAX_WEAPONS } from "../comp-analyzer-constants";
import styles from "./SelectedWeapons.module.css";

interface SelectedWeaponsProps {
	selectedWeaponIds: MainWeaponId[];
	onRemove: (index: number) => void;
}

export function SelectedWeapons({
	selectedWeaponIds,
	onRemove,
}: SelectedWeaponsProps) {
	const { t } = useTranslation(["weapons", "analyzer"]);

	const slots = Array.from({ length: MAX_WEAPONS }, (_, i) => {
		return selectedWeaponIds[i] ?? null;
	});

	return (
		<div className={styles.selectedWeapons} data-testid="selected-weapons">
			{slots.map((weaponId, index) => {
				if (weaponId === null) {
					return (
						<div key={`empty-${index}`} className={styles.selectedWeaponRow}>
							<div className={styles.weaponImageContainerEmpty}>
								<Image path={abilityImageUrl("UNKNOWN")} alt="" size={48} />
							</div>
							<div className={styles.weaponNamePillEmpty}>
								<span className={styles.weaponNameEmpty}>
									{t("analyzer:comp.pickWeapon")}
								</span>
							</div>
							<div className={styles.subSpecialContainerSpacer} />
						</div>
					);
				}

				const params = mainWeaponParams(weaponId);

				return (
					<div
						key={index}
						className={styles.selectedWeaponRow}
						data-testid={`selected-weapon-${index}`}
					>
						<div className={styles.weaponImageContainer}>
							<WeaponImage weaponSplId={weaponId} variant="build" size={48} />
						</div>
						<div className={styles.weaponNamePill}>
							<span className={styles.weaponName}>
								{t(`weapons:MAIN_${weaponId}`)}
							</span>
							<button
								type="button"
								className={styles.removeButton}
								onClick={() => onRemove(index)}
								aria-label={t("analyzer:comp.removeWeapon")}
								data-testid={`remove-weapon-${index}`}
							>
								&times;
							</button>
						</div>
						<div className={styles.subSpecialContainer}>
							<div className={styles.kitIcon}>
								<Image
									path={subWeaponImageUrl(params.subWeaponId)}
									alt={t(`weapons:SUB_${params.subWeaponId}`)}
									size={24}
								/>
							</div>
							<div className={styles.kitIcon}>
								<Image
									path={specialWeaponImageUrl(params.specialWeaponId)}
									alt={t(`weapons:SPECIAL_${params.specialWeaponId}`)}
									size={24}
								/>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
