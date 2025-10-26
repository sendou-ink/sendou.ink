import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { WeaponImage } from "~/components/Image";
import { vodVideoPage } from "~/utils/urls";
import type { ListVod } from "../vods-types";
import styles from "./VodListing.module.css";
import { PovUser } from "./VodPov";

export function VodListing({
	vod,
	showUser = true,
}: {
	vod: ListVod;
	showUser?: boolean;
}) {
	const { t } = useTranslation(["vods"]);

	return (
		<div className={styles.listing}>
			<Link to={vodVideoPage(vod.id)} className="stack sm">
				<img
					className={styles.thumbnail}
					alt=""
					src={youtubeIdToThumbnailUrl(vod.youtubeId)}
				/>
				<h2 className="text-sm text-main-forced">{vod.title}</h2>
			</Link>
			<div className={styles.info}>
				{vod.type === "CAST" || !showUser ? (
					<div className={styles.castText}>{t(`vods:type.${vod.type}`)}</div>
				) : (
					<PovUser pov={vod.pov} />
				)}
				<WeaponsPeek weapons={vod.weapons} />
			</div>
		</div>
	);
}

const MAX_WEAPONS_TO_SHOW = 4;
function WeaponsPeek({ weapons }: { weapons: ListVod["weapons"] }) {
	const limitedWeapons =
		weapons.length <= MAX_WEAPONS_TO_SHOW
			? weapons
			: weapons.slice(0, MAX_WEAPONS_TO_SHOW - 1);

	const amountOfWeaponsNotShown = weapons.length - limitedWeapons.length;

	return (
		<div className="stack horizontal xs">
			{limitedWeapons.map((weapon) => (
				<WeaponImage
					key={weapon}
					variant="build"
					weaponSplId={weapon}
					width={38}
				/>
			))}
			{amountOfWeaponsNotShown > 0 ? (
				<div className={styles.weaponsNotShown}>+{amountOfWeaponsNotShown}</div>
			) : null}
		</div>
	);
}

function youtubeIdToThumbnailUrl(youtubeId: string) {
	return `http://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}
