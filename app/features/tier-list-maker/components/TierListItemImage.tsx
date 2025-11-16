import {
	ModeImage,
	SpecialWeaponImage,
	StageImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TierListItem } from "../tier-list-maker-schemas";
import styles from "./TierListItemImage.module.css";

interface TierListItemImageProps {
	item: TierListItem;
}

export function TierListItemImage({ item }: TierListItemImageProps) {
	switch (item.type) {
		case "main-weapon":
			return (
				<div className={styles.imageWrapper}>
					<WeaponImage weaponSplId={item.id} variant="badge" size={48} />
				</div>
			);
		case "sub-weapon":
			return (
				<div className={styles.imageWrapper}>
					<SubWeaponImage subWeaponId={item.id} size={48} />
				</div>
			);
		case "special-weapon":
			return (
				<div className={styles.imageWrapper}>
					<SpecialWeaponImage specialWeaponId={item.id} size={48} />
				</div>
			);
		case "stage":
			return (
				<div className={styles.imageWrapper}>
					<StageImage stageId={item.id} width={80} className="rounded-sm" />
				</div>
			);
		case "mode":
			return (
				<div className={styles.imageWrapper}>
					<ModeImage mode={item.id} width={48} height={48} />
				</div>
			);
		case "stage-mode": {
			const [stageIdStr, mode] = item.id.split("-");
			const stageId = Number(stageIdStr) as StageId;
			return (
				<div className={styles.imageWrapper}>
					<div className="relative">
						<StageImage stageId={stageId} width={80} className="rounded-sm" />
						<ModeImage
							mode={mode as ModeShort}
							width={24}
							height={24}
							className={styles.modeOverlay}
						/>
					</div>
				</div>
			);
		}
	}
}
