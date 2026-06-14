import { useTranslation } from "react-i18next";
import {
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import type { WeaponKitInfo } from "../weapon-params-types";
import styles from "./WeaponKits.module.css";

export function WeaponKits({ kits }: { kits: WeaponKitInfo[] }) {
	const { t } = useTranslation(["weapons"]);

	return (
		<ul className={styles.kits}>
			{kits.map((kit) => (
				<li key={kit.weaponId} className={styles.kit}>
					<WeaponImage weaponSplId={kit.weaponId} variant="badge" size={28} />
					<span className={styles.kitName}>
						{t(`weapons:MAIN_${kit.weaponId}`)}
					</span>
					<span className={styles.kitGear}>
						<SubWeaponImage subWeaponId={kit.subWeaponId} size={22} />
						<SpecialWeaponImage
							specialWeaponId={kit.specialWeaponId}
							size={22}
						/>
					</span>
				</li>
			))}
		</ul>
	);
}
