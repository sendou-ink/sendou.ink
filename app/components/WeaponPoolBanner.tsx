import clsx from "clsx";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import { WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import styles from "./WeaponPoolBanner.module.css";

type WeaponPoolBannerTarget =
	| {
			weaponHref: (weaponId: MainWeaponId) => string;
			defaultShouldRevalidate?: boolean;
			preventScrollReset?: boolean;
			onWeaponPress?: never;
	  }
	| {
			onWeaponPress: (weaponId: MainWeaponId) => void;
			weaponHref?: never;
			defaultShouldRevalidate?: never;
			preventScrollReset?: never;
	  };

/** Highlighted row of quick links (or quick picks) to the weapons of the user's match profile weapon pool. */
export function WeaponPoolBanner({
	weaponIds,
	mini,
	className,
	...target
}: {
	weaponIds: MainWeaponId[];
	/** Only the star icon instead of the full header. */
	mini?: boolean;
	className?: string;
} & WeaponPoolBannerTarget) {
	const { t } = useTranslation(["common"]);

	return (
		<section
			className={clsx(styles.weaponPoolBanner, className, {
				[styles.mini]: mini,
			})}
		>
			{mini ? (
				<Star
					className={styles.icon}
					role="img"
					aria-label={t("common:yourWeapons")}
				/>
			) : (
				<h2 className={styles.header}>
					<Star className={styles.icon} aria-hidden />
					{t("common:yourWeapons")}
				</h2>
			)}
			<div className={styles.weapons}>
				{weaponIds.map((weaponId) => {
					const image = (
						<CircleBackdrop>
							<WeaponImage weaponSplId={weaponId} variant="badge" size={28} />
						</CircleBackdrop>
					);

					return target.onWeaponPress ? (
						<button
							key={weaponId}
							type="button"
							className={styles.weapon}
							onClick={() => target.onWeaponPress(weaponId)}
						>
							{image}
						</button>
					) : (
						<Link
							key={weaponId}
							to={target.weaponHref(weaponId)}
							defaultShouldRevalidate={target.defaultShouldRevalidate}
							preventScrollReset={target.preventScrollReset}
							className={styles.weapon}
						>
							{image}
						</Link>
					);
				})}
			</div>
		</section>
	);
}
