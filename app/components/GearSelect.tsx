import { useTranslation } from "react-i18next";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import { Image } from "~/components/Image";
import type { GearType } from "~/db/tables";
import { brandIds } from "~/modules/in-game-lists/brand-ids";
import {
	clothesGearBrandGrouped,
	headGearBrandGrouped,
	shoesGearBrandGrouped,
} from "~/modules/in-game-lists/gear-ids";
import { brandImageUrl, gearImageUrl } from "~/utils/urls";

import styles from "./WeaponSelect.module.css";

interface GearSelectProps<Clearable extends boolean | undefined = undefined> {
	label?: string;
	value?: number | (Clearable extends true ? null : never);
	initialValue?: number;
	onChange?: (
		weaponId: number | (Clearable extends true ? null : never),
	) => void;
	clearable?: Clearable;
	type: GearType;
}

export function GearSelect<Clearable extends boolean | undefined = undefined>({
	label,
	value,
	initialValue,
	onChange,
	clearable,
	type,
}: GearSelectProps<Clearable>) {
	const { t } = useTranslation(["common"]);
	const items = useGearItems(type);

	return (
		<SendouSelect
			aria-label={!label ? t("common:forms.gearSearch.placeholder") : undefined}
			items={items}
			label={label}
			placeholder={t("common:forms.gearSearch.placeholder")}
			search={{
				placeholder: t("common:forms.gearSearch.search.placeholder"),
			}}
			className={styles.selectWidthWider}
			popoverClassName={styles.selectWidthWider}
			selectedKey={value}
			defaultSelectedKey={initialValue}
			onSelectionChange={(value) => onChange?.(value as any)}
			clearable={clearable}
			data-testid={`${type}-gear-select`}
		>
			{({ key, items: gear, brandId, idx }) => (
				<SendouSelectItemSection
					className={idx === 0 ? "pt-0-5-forced" : undefined}
					heading={t(`game-misc:BRAND_${brandId}` as any)}
					headingImgPath={brandImageUrl(brandId)}
					key={key}
				>
					{gear.map(({ id, name }) => (
						<SendouSelectItem key={id} id={id} textValue={name}>
							<div className={styles.item}>
								<Image
									path={gearImageUrl(type, id)}
									size={24}
									alt=""
									className={styles.weaponImg}
								/>
								<span
									className={styles.weaponLabel}
									data-testid={`gear-select-option-${name}`}
								>
									{name}
								</span>
							</div>
						</SendouSelectItem>
					))}
				</SendouSelectItemSection>
			)}
		</SendouSelect>
	);
}

function useGearItems(type: GearType) {
	const { t } = useTranslation(["gear", "game-misc"]);

	const translationPrefix =
		type === "HEAD" ? "H" : type === "CLOTHES" ? "C" : "S";

	const groupedGear =
		type === "HEAD"
			? headGearBrandGrouped
			: type === "CLOTHES"
				? clothesGearBrandGrouped
				: shoesGearBrandGrouped;

	const items = brandIds.map((brandId, idx) => {
		const items = groupedGear[brandId] || [];

		return {
			brandId,
			key: brandId,
			idx,
			items: items.map((gearId) => ({
				id: gearId,
				name: t(`${translationPrefix}_${gearId}` as any),
			})),
		};
	});

	return items;
}
