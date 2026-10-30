import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { SpecialWeaponImage, SubWeaponImage } from "~/components/Image";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	SPECIAL_CATEGORY_ORDER,
	SPECIAL_WEAPON_CATEGORIES,
	type SpecialWeaponCategory,
	SUB_CATEGORY_ORDER,
	SUB_WEAPON_CATEGORIES,
	type SubWeaponCategory,
} from "../comp-analyzer-constants";
import styles from "./WeaponCategories.module.css";

interface WeaponCategoriesProps {
	selectedWeaponIds: MainWeaponId[];
}

interface SubWeaponItem {
	subId: SubWeaponId;
	category: SubWeaponCategory;
	weaponIndex: number;
}

interface SpecialWeaponItem {
	specialId: SpecialWeaponId;
	category: SpecialWeaponCategory;
	weaponIndex: number;
}

export function WeaponCategories({ selectedWeaponIds }: WeaponCategoriesProps) {
	const { t } = useTranslation(["weapons", "analyzer"]);

	const subItems: SubWeaponItem[] = [];
	const specialItems: SpecialWeaponItem[] = [];

	for (const [index, weaponId] of selectedWeaponIds.entries()) {
		const params = mainWeaponParams(weaponId);

		subItems.push({
			subId: params.subWeaponId,
			category: SUB_WEAPON_CATEGORIES[params.subWeaponId],
			weaponIndex: index,
		});

		specialItems.push({
			specialId: params.specialWeaponId,
			category: SPECIAL_WEAPON_CATEGORIES[params.specialWeaponId],
			weaponIndex: index,
		});
	}

	const sortedSubItems = [...subItems].sort((a, b) => {
		const aIndex = SUB_CATEGORY_ORDER.indexOf(a.category);
		const bIndex = SUB_CATEGORY_ORDER.indexOf(b.category);
		if (aIndex !== bIndex) return aIndex - bIndex;
		return a.weaponIndex - b.weaponIndex;
	});

	const sortedSpecialItems = [...specialItems].sort((a, b) => {
		const aIndex = SPECIAL_CATEGORY_ORDER.indexOf(a.category);
		const bIndex = SPECIAL_CATEGORY_ORDER.indexOf(b.category);
		if (aIndex !== bIndex) return aIndex - bIndex;
		return a.weaponIndex - b.weaponIndex;
	});

	const isEmpty = selectedWeaponIds.length === 0;

	return (
		<div className={styles.container}>
			<div className={styles.categorySection}>
				<div className={styles.categoryLabel}>
					{t("analyzer:comp.subRoles")}
				</div>
				{isEmpty ? (
					<EmptyPill />
				) : (
					<div className={styles.categoryPill}>
						{sortedSubItems.map((item, index) => (
							<div
								key={`${item.weaponIndex}-${item.subId}`}
								className={styles.categoryItem}
								data-first={index === 0}
							>
								<SubWeaponImage subWeaponId={item.subId} size={20} />
								<span className={styles.categoryName}>
									{t(`analyzer:comp.subCategory.${item.category}`)}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
			<div className={styles.categorySection}>
				<div className={styles.categoryLabel}>
					{t("analyzer:comp.specialRoles")}
				</div>
				{isEmpty ? (
					<EmptyPill />
				) : (
					<div className={styles.categoryPill}>
						{sortedSpecialItems.map((item, index) => (
							<div
								key={`${item.weaponIndex}-${item.specialId}`}
								className={styles.categoryItem}
								data-first={index === 0}
							>
								<SpecialWeaponImage
									specialWeaponId={item.specialId}
									size={20}
								/>
								<span className={styles.categoryName}>
									{t(`analyzer:comp.specialCategory.${item.category}`)}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function EmptyPill() {
	const { t } = useTranslation(["analyzer"]);

	return (
		<div className={clsx(styles.categoryPill, styles.categoryPillEmpty)}>
			<div className={styles.emptyPillSizer} aria-hidden="true">
				<div className={styles.emptyPillSizerIcon} />
				<span className={styles.categoryName}>&nbsp;</span>
			</div>
			<span className={styles.emptyPillText}>
				{t("analyzer:comp.pickWeapon")}
			</span>
		</div>
	);
}
