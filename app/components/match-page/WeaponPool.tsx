import clsx from "clsx";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { abilityImageUrl } from "~/utils/urls";
import { SendouPopover } from "../elements/Popover";
import { Image, WeaponImage } from "../Image";
import styles from "./WeaponPool.module.css";

export type WeaponPoolWeapon =
	| MainWeaponId
	| {
			weaponSplId: MainWeaponId;
			/** renders faded, e.g. an ingested weapon not yet linked to its user */
			unverified?: boolean;
	  }
	| null;

// xxx: maybe sort confirmed first then unconfirmed in weapon id order
export function WeaponPool({
	weapons,
	size = 32,
}: {
	weapons: WeaponPoolWeapon[];
	size?: number;
}) {
	const { t } = useTranslation(["weapons"]);

	const entries = weapons.map((weapon) =>
		typeof weapon === "number" ? { weaponSplId: weapon } : weapon,
	);

	return (
		<SendouPopover
			trigger={
				<Button className={styles.weaponRow}>
					{entries.map((weapon, i) =>
						weapon !== null ? (
							<WeaponImage
								key={i}
								weaponSplId={weapon.weaponSplId}
								variant="badge"
								size={size}
								className={clsx({
									[styles.unverifiedWeapon]: weapon.unverified,
								})}
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
				{entries.map((weapon, i) =>
					weapon !== null ? (
						<div key={i} className={styles.weaponPopoverRow}>
							<WeaponImage
								weaponSplId={weapon.weaponSplId}
								variant="badge"
								size={32}
							/>
							<span>{t(`weapons:MAIN_${weapon.weaponSplId}` as any)}</span>
						</div>
					) : null,
				)}
			</div>
		</SendouPopover>
	);
}
