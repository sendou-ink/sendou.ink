import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import { SendouPopover } from "../elements/Popover";
import { Image, WeaponImage } from "../Image";
import styles from "./WeaponPool.module.css";

export function WeaponPool({
	weapons,
	size = 24,
}: {
	weapons: Array<MainWeaponId | null>;
	size?: number;
}) {
	const { t } = useTranslation(["weapons"]);

	return (
		<SendouPopover
			trigger={
				<Button className={styles.weaponRow}>
					{weapons.map((weaponId, i) =>
						weaponId !== null ? (
							<WeaponImage
								key={i}
								weaponSplId={weaponId}
								variant="badge"
								size={size}
							/>
						) : (
							<Image
								key={i}
								className={styles.unknownWeapon}
								path={abilityImageUrl("UNKNOWN")}
								alt="?"
								size={size}
							/>
						),
					)}
				</Button>
			}
		>
			<div className={styles.weaponPopover}>
				{weapons.map((weaponId, i) =>
					weaponId !== null ? (
						<div key={i} className={styles.weaponPopoverRow}>
							<WeaponImage weaponSplId={weaponId} variant="badge" size={32} />
							<span>{t(`weapons:MAIN_${weaponId}` as any)}</span>
						</div>
					) : null,
				)}
			</div>
		</SendouPopover>
	);
}
