import * as React from "react";
import type { Key } from "react-aria-components";
import { useTranslation } from "react-i18next";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import { Image, WeaponImage } from "~/components/Image";
import type { AnyWeapon } from "~/features/build-analyzer";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import {
	SPLAT_BOMB_ID,
	specialWeaponIds,
	subWeaponIds,
	TRIZOOKA_ID,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";
import {
	specialWeaponImageUrl,
	subWeaponImageUrl,
	weaponCategoryUrl,
} from "~/utils/urls";

import styles from "./WeaponSelect.module.css";

interface WeaponSelectProps<
	Clearable extends boolean | undefined = undefined,
	IncludeSubSpecial extends boolean | undefined = undefined,
> {
	label?: string;
	value?: (IncludeSubSpecial extends true ? AnyWeapon : MainWeaponId) | null;
	initialValue?: IncludeSubSpecial extends true ? AnyWeapon : MainWeaponId;
	onChange?: (
		weaponId:
			| (IncludeSubSpecial extends true ? AnyWeapon : MainWeaponId)
			| (Clearable extends true ? null : never),
	) => void;
	clearable?: Clearable;
	includeSubSpecial?: IncludeSubSpecial;
	disabledWeaponIds?: Array<MainWeaponId>; // TODO: implement for `AnyWeapon` if needed
	testId?: string;
	isRequired?: boolean;
	/** If set, selection of weapons that user sees when search input is empty allowing for quick select for e.g. previous selections */
	quickSelectWeaponsIds?: Array<MainWeaponId>;
}

// TODO: fix selected value disappears when filtered out. This is because `items` is filtered in a controlled manner and the selected key might not be included in the filtered items.
export function WeaponSelect<
	Clearable extends boolean | undefined = undefined,
	IncludeSubSpecial extends boolean | undefined = undefined,
>({
	label,
	value,
	initialValue,
	onChange,
	disabledWeaponIds,
	clearable,
	includeSubSpecial,
	testId = "weapon-select",
	isRequired,
	quickSelectWeaponsIds,
}: WeaponSelectProps<Clearable, IncludeSubSpecial>) {
	const { t } = useTranslation(["common"]);
	const { items, filterValue, setFilterValue } = useFilteredWeaponItems({
		includeSubSpecial,
		quickSelectWeaponsIds,
	});

	const keyify = (value?: MainWeaponId | AnyWeapon | null) => {
		if (typeof value === "number") return `MAIN_${value}`;
		if (!value) return null;

		return `${value.type}_${value.id}`;
	};

	const handleOnChange = (key: Key | null) => {
		if (key === null) return onChange?.(null as any);
		const [type, id] = (key as string).split("_");
		const weapon = {
			id: Number(id),
			type: type as "MAIN" | "SUB" | "SPECIAL",
		} as AnyWeapon;

		if (!includeSubSpecial) return onChange?.(weapon.id as any); // plain main weapon id

		onChange?.(weapon as any);
	};

	return (
		<SendouSelect
			aria-label={
				!label ? t("common:forms.weaponSearch.placeholder") : undefined
			}
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
			selectedKey={keyify(value)}
			defaultSelectedKey={keyify(initialValue) ?? undefined}
			onSelectionChange={handleOnChange}
			clearable={clearable}
			data-testid={testId}
			isRequired={isRequired}
		>
			{({ key, items: weapons, name, idx }) => (
				<SendouSelectItemSection
					heading={name}
					headingImgPath={
						key === "quick-select"
							? undefined
							: name === "subs"
								? subWeaponImageUrl(SPLAT_BOMB_ID)
								: name === "specials"
									? specialWeaponImageUrl(TRIZOOKA_ID)
									: weaponCategoryUrl(name)
					}
					className={idx === 0 ? "pt-0-5-forced" : undefined}
					key={key}
				>
					{weapons.map(({ weapon, name }) => (
						<SendouSelectItem
							key={weapon.anyWeaponId}
							id={weapon.anyWeaponId}
							textValue={name}
							isDisabled={
								includeSubSpecial
									? false
									: disabledWeaponIds?.includes(weapon.id as MainWeaponId)
							}
						>
							<div className={styles.item}>
								{weapon.type === "MAIN" ? (
									<WeaponImage
										weaponSplId={weapon.id}
										variant="build"
										size={24}
										className={styles.weaponImg}
									/>
								) : weapon.type === "SUB" ? (
									<Image
										path={subWeaponImageUrl(weapon.id)}
										size={24}
										alt=""
										className={styles.weaponImg}
									/>
								) : (
									<Image
										path={specialWeaponImageUrl(weapon.id)}
										size={24}
										alt=""
										className={styles.weaponImg}
									/>
								)}
								<span
									className={styles.weaponLabel}
									data-testid={`weapon-select-option-${name}`}
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

function useFilteredWeaponItems({
	includeSubSpecial,
	quickSelectWeaponsIds,
}: {
	includeSubSpecial: boolean | undefined;
	quickSelectWeaponsIds?: Array<MainWeaponId>;
}) {
	const items = useAllWeaponCategories(includeSubSpecial);
	const [filterValue, setFilterValue] = React.useState("");
	const { t } = useTranslation(["common"]);

	const showQuickSelectWeapons =
		filterValue === "" && quickSelectWeaponsIds?.length;

	const filteredItems = () => {
		if (showQuickSelectWeapons) {
			return [
				{
					idx: 0,
					key: "quick-select" as const,
					name: t("common:forms.weaponSearch.quickSelect"),
					items: items
						.flatMap((c) =>
							c.items
								.map((item) => (item.weapon.type === "MAIN" ? item : null))
								.filter((val) => val !== null),
						)
						.filter((item) =>
							quickSelectWeaponsIds.includes(item.weapon.id as MainWeaponId),
						)
						.sort((a, b) => {
							const aIdx = quickSelectWeaponsIds.indexOf(
								a.weapon.id as MainWeaponId,
							);
							const bIdx = quickSelectWeaponsIds.indexOf(
								b.weapon.id as MainWeaponId,
							);
							return aIdx - bIdx;
						}),
				},
			];
		}

		return !filterValue
			? items
			: items
					.map((category) => {
						const filteredItems = category.items.filter((item) =>
							filterWeapon({
								weapon: item.weapon,
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
	};

	return {
		items: filteredItems(),
		filterValue,
		setFilterValue,
	};
}

function useAllWeaponCategories(withSubSpecial = false) {
	const { t } = useTranslation(["weapons"]);

	const mainWeaponCategories = weaponCategories.map((category, idx) => ({
		name: category.name,
		key: category.name,
		idx,
		items: category.weaponIds.map((id) => ({
			name: t(`weapons:MAIN_${id}`),
			weapon: {
				anyWeaponId: `MAIN_${id}`,
				id,
				type: "MAIN" as const,
			},
		})),
	}));

	if (!withSubSpecial) {
		return mainWeaponCategories;
	}

	const subWeaponCategory = {
		name: "subs" as const,
		key: "subs",
		idx: 0,
		items: subWeaponIds.map((id) => ({
			name: t(`weapons:SUB_${id}`),
			weapon: {
				anyWeaponId: `SUB_${id}`,
				id,
				type: "SUB" as const,
			},
		})),
	};

	const specialWeaponCategory = {
		name: "specials" as const,
		key: "specials",
		idx: 1,
		items: specialWeaponIds.map((id) => ({
			name: t(`weapons:SPECIAL_${id}`),
			weapon: {
				anyWeaponId: `SPECIAL_${id}`,
				id,
				type: "SPECIAL" as const,
			},
		})),
	};

	return [
		subWeaponCategory,
		specialWeaponCategory,
		...mainWeaponCategories.map((c) => ({ ...c, idx: c.idx + 2 })),
	];
}
