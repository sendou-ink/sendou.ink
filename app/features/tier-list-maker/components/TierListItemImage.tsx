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
			return <WeaponImage weaponSplId={item.id} variant="badge" size={48} />;
		case "sub-weapon":
			return <SubWeaponImage subWeaponId={item.id} size={48} />;
		case "special-weapon":
			return <SpecialWeaponImage specialWeaponId={item.id} size={48} />;
		case "stage":
			return <StageImage stageId={item.id} width={80} className="rounded-sm" />;
		case "mode":
			return <ModeImage mode={item.id} width={48} height={48} />;
		case "stage-mode": {
			const [stageIdStr, mode] = item.id.split("-");
			const stageId = Number(stageIdStr) as StageId;
			return (
				<div className="relative">
					<StageImage stageId={stageId} width={80} className="rounded-sm" />
					<ModeImage
						mode={mode as ModeShort}
						width={24}
						height={24}
						className={styles.modeOverlay}
					/>
				</div>
			);
		}
	}
}
