import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import { WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import styles from "./WeaponPoolBanner.module.css";

/** Highlighted row of quick links to the weapons of the user's match profile weapon pool. */
export function WeaponPoolBanner({
	weaponIds,
	weaponHref,
	defaultShouldRevalidate,
}: {
	weaponIds: MainWeaponId[];
	weaponHref: (weaponId: MainWeaponId) => string;
	defaultShouldRevalidate?: boolean;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<section className={styles.weaponPoolBanner}>
			<h2 className={styles.header}>
				<Star className={styles.icon} aria-hidden />
				{t("common:yourWeapons")}
			</h2>
			<div className={styles.weapons}>
				{weaponIds.map((weaponId) => (
					<Link
						key={weaponId}
						to={weaponHref(weaponId)}
						defaultShouldRevalidate={defaultShouldRevalidate}
						className={styles.weapon}
					>
						<CircleBackdrop>
							<WeaponImage weaponSplId={weaponId} variant="badge" size={28} />
						</CircleBackdrop>
					</Link>
				))}
			</div>
		</section>
	);
}
