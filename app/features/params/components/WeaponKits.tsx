import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { weaponSlug } from "~/utils/english-weapon-names";
import { weaponParamsPage } from "~/utils/urls";
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
						<Link
							to={weaponParamsPage(
								weaponSlug({ type: "SUB", id: kit.subWeaponId }),
							)}
							className={styles.gearLink}
						>
							<SubWeaponImage subWeaponId={kit.subWeaponId} size={22} />
						</Link>
						<Link
							to={weaponParamsPage(
								weaponSlug({ type: "SPECIAL", id: kit.specialWeaponId }),
							)}
							className={styles.gearLink}
						>
							<SpecialWeaponImage
								specialWeaponId={kit.specialWeaponId}
								size={22}
							/>
						</Link>
					</span>
				</li>
			))}
		</ul>
	);
}
