import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Image, WeaponImage } from "~/components/Image";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { weaponCategoryUrl } from "~/utils/urls";

import styles from "./WeaponSelect.module.css";

interface WeaponSelectProps<Clearable extends boolean | undefined = undefined> {
	label?: string;
	initialWeaponId?: MainWeaponId;
	onChange?: (
		weaponId: MainWeaponId | (Clearable extends true ? null : never),
	) => void;
	clearable?: Clearable;
	disabledWeaponIds?: Array<MainWeaponId>;
	testId?: string;
}

// xxx: selected value disappears if filtered out
export function WeaponSelect<
	Clearable extends boolean | undefined = undefined,
>({
	label,
	initialWeaponId,
	onChange,
	disabledWeaponIds,
	clearable,
	testId,
}: WeaponSelectProps<Clearable>) {
	const { t } = useTranslation(["common"]);
	const { items, filterValue, setFilterValue } = useFilteredWeaponItems();

	return (
		<SendouSelect
			aria-label={!label ? "Select a weapon" : undefined}
			items={items}
			label={label}
			placeholder={t("common:forms.weaponSearch.placeholder")}
			search={{
				placeholder: t("common:forms.weaponSearch.search.placeholder"),
			}}
			className={styles.selectWidthWider}
			popoverClassName={styles.selectWidthWider}
			searchInputValue={filterValue}
			onSearchInputChange={setFilterValue}
			defaultSelectedKey={initialWeaponId}
			onSelectionChange={(key) => onChange?.(key as MainWeaponId)}
			clearable={clearable}
			data-testid={testId}
		>
			{({ key, items, name, idx }) => (
				<SendouSelectItemSection
					heading={
						<CategoryHeading
							name={name}
							className={idx === 0 ? "pt-0-5-forced" : undefined}
						/>
					}
					key={key}
				>
					{items.map(({ key, ...item }) => (
						<SendouSelectItem
							key={key}
							textValue={item.name}
							isDisabled={disabledWeaponIds?.includes(item.id)}
							{...item}
						>
							<div className={styles.item}>
								<WeaponImage
									weaponSplId={item.id}
									variant="build"
									size={24}
									className={styles.weaponImg}
								/>
								<span
									className={styles.weaponLabel}
									data-testid={`weapon-select-option-${item.name}`}
								>
									{item.name}
								</span>
							</div>
						</SendouSelectItem>
					))}
				</SendouSelectItemSection>
			)}
		</SendouSelect>
	);
}

function CategoryHeading({
	name,
	className,
}: { name: (typeof weaponCategories)[number]["name"]; className?: string }) {
	const { t } = useTranslation(["common"]);

	return (
		<div className={clsx(className, styles.categoryHeading)}>
			<Image
				path={weaponCategoryUrl(name)}
				size={28}
				alt={t(`common:weapon.category.${name}`)}
			/>
			{t(`common:weapon.category.${name}`)}
			<div className={styles.categoryDivider} />
		</div>
	);
}

function useFilteredWeaponItems() {
	const { t } = useTranslation(["weapons"]);
	const [filterValue, setFilterValue] = React.useState("");

	const items = weaponCategories.map((category, idx) => ({
		key: category.name,
		name: category.name,
		idx,
		items: category.weaponIds.map((id) => ({
			id,
			name: t(`weapons:MAIN_${id}`),
			key: id,
		})),
	}));

	const filtered = !filterValue
		? items
		: items
				.map((category) => {
					const filteredItems = category.items.filter((item) =>
						filterWeapon({
							weaponId: item.id,
							weaponName: item.name,
							searchTerm: filterValue,
						}),
					);

					return {
						...category,
						items: filteredItems,
					};
				})
				.filter((category) => category.items.length > 0)
				.map((category, idx) => ({ ...category, idx }));

	return {
		items: filtered,
		filterValue,
		setFilterValue,
	};
}
