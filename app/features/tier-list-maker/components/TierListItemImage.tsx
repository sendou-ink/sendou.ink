import {
	SpecialWeaponImage,
	StageImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import type { TierListItem } from "../tier-list-maker-types";

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
	}
}
