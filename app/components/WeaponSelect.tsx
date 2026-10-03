import type { TFunction } from "i18next";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	type SelectKey,
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import { Image, WeaponImage } from "~/components/Image";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import {
	mainWeaponIds,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";
import { weaponCategoryUrl } from "~/utils/urls";

import styles from "./WeaponSelect.module.css";

interface WeaponSelectProps<Clearable extends boolean | undefined = undefined> {
	label?: string;
	value?: MainWeaponId | null;
	initialValue?: MainWeaponId;
	onChange?: (
		weaponId: MainWeaponId | (Clearable extends true ? null : never),
	) => void;
	clearable?: Clearable;
	disabledWeaponIds?: Array<MainWeaponId>;
	testId?: string;
	isRequired?: boolean;
	/** Shown while the search input is empty, e.g. previous selections */
	quickSelectWeaponsIds?: Array<MainWeaponId>;
	isDisabled?: boolean;
	placeholder?: string;
}

export function WeaponSelect<
	Clearable extends boolean | undefined = undefined,
>({
	label,
	value,
	initialValue,
	onChange,
	disabledWeaponIds,
	clearable,
	testId = "weapon-select",
	isRequired,
	quickSelectWeaponsIds,
	isDisabled,
	placeholder,
}: WeaponSelectProps<Clearable>) {
	const { t } = useTranslation(["common"]);
	const isControlled = value !== undefined;
	const [lastUncontrolledKey, setLastUncontrolledKey] = React.useState<
		string | null
	>(() => keyify(initialValue) ?? null);
	const selectedKey = isControlled ? keyify(value) : lastUncontrolledKey;
	const { items, filterValue, setFilterValue } = useWeaponItems({
		quickSelectWeaponsIds,
		selectedKey,
	});
	const filter = useWeaponFilter();

	const handleOnChange = (key: SelectKey | null) => {
		if (!isControlled) {
			setLastUncontrolledKey(key === null ? null : String(key));
		}
		if (key === null) return onChange?.(null as any);
		const [, id] = (key as string).split("_");

		onChange?.(Number(id) as MainWeaponId);
	};

	return (
		<SendouSelect
			aria-label={
				!label ? t("common:forms.weaponSearch.placeholder") : undefined
			}
			isDisabled={isDisabled}
			items={items}
			label={label}
			placeholder={placeholder ?? t("common:forms.weaponSearch.placeholder")}
			search={{
				placeholder: t("common:forms.weaponSearch.search.placeholder"),
			}}
			searchInputValue={filterValue}
			onSearchInputChange={setFilterValue}
			selectedKey={isControlled ? keyify(value) : undefined}
			defaultSelectedKey={
				isControlled ? undefined : (keyify(initialValue) as SelectKey)
			}
			onSelectionChange={handleOnChange}
			clearable={clearable}
			data-testid={testId}
			isRequired={isRequired}
			filter={filter}
		>
			{({ key, items: weapons, name, idx }) => (
				<SendouSelectItemSection
					heading={name}
					headingImg={
						key === "quick-select" ? undefined : (
							<Image path={weaponCategoryUrl(name)} size={28} alt="" />
						)
					}
					className={idx === 0 ? "pt-0-5" : undefined}
					key={key}
				>
					{weapons.map(({ weapon, name: weaponName }) => (
						<SendouSelectItem
							key={weapon.anyWeaponId}
							id={weapon.anyWeaponId}
							textValue={weaponName}
							className={styles.option}
							isDisabled={disabledWeaponIds?.includes(weapon.id)}
						>
							<div className={styles.item}>
								<WeaponImage
									weaponSplId={weapon.id}
									variant="build"
									size={24}
									className={styles.weaponImg}
								/>
								<span
									className={styles.weaponLabel}
									data-testid={`weapon-select-option-${weaponName}`}
								>
									{weaponName}
								</span>
							</div>
						</SendouSelectItem>
					))}
				</SendouSelectItemSection>
			)}
		</SendouSelect>
	);
}

const weaponNameToWeaponMapCache = new Map<
	string,
	Map<string, { id: MainWeaponId; type: "MAIN" }>
>();

function useWeaponFilter() {
	const { t, i18n } = useTranslation(["weapons"]);

	const cached = weaponNameToWeaponMapCache.get(i18n.language);
	const weaponNameToWeaponMap = cached ?? buildWeaponNameToWeaponMap(t);
	if (!cached && i18n.hasLoadedNamespace("weapons")) {
		weaponNameToWeaponMapCache.set(i18n.language, weaponNameToWeaponMap);
	}

	return (value: string, searchValue: string) => {
		const weapon = weaponNameToWeaponMap.get(value);
		if (!weapon) return false;

		return filterWeapon({
			weapon,
			weaponName: value,
			searchTerm: searchValue,
		});
	};
}

function buildWeaponNameToWeaponMap(t: TFunction<["weapons"]>) {
	const map = new Map<string, { id: MainWeaponId; type: "MAIN" }>();

	for (const id of mainWeaponIds) {
		map.set(t(`weapons:MAIN_${id}`), { id, type: "MAIN" });
	}

	return map;
}

function useWeaponItems({
	quickSelectWeaponsIds,
	selectedKey,
}: {
	quickSelectWeaponsIds?: Array<MainWeaponId>;
	selectedKey: string | null | undefined;
}) {
	const items = useAllWeaponCategories();
	const [filterValue, setFilterValue] = React.useState("");
	const { t } = useTranslation(["common"]);

	const showQuickSelectWeapons =
		filterValue === "" && quickSelectWeaponsIds?.length;

	if (showQuickSelectWeapons) {
		const weaponIdsToInclude = new Set(quickSelectWeaponsIds);
		// the selected weapon stays in the list so the trigger can show it
		if (selectedKey?.startsWith("MAIN_")) {
			weaponIdsToInclude.add(
				Number(selectedKey.slice("MAIN_".length)) as MainWeaponId,
			);
		}

		const quickSelectCategory = {
			idx: 0,
			key: "quick-select" as const,
			name: t("common:forms.weaponSearch.quickSelect"),
			items: items
				.flatMap((c) => c.items)
				.filter((item) => weaponIdsToInclude.has(item.weapon.id))
				.sort(
					(a, b) =>
						quickSelectWeaponsIds.indexOf(a.weapon.id) -
						quickSelectWeaponsIds.indexOf(b.weapon.id),
				),
		};

		return {
			items: [quickSelectCategory] as typeof items,
			filterValue,
			setFilterValue,
		};
	}

	return {
		items,
		filterValue,
		setFilterValue,
	};
}

const allWeaponCategoriesCache = new Map<
	string,
	ReturnType<typeof buildAllWeaponCategories>
>();

function useAllWeaponCategories() {
	const { t, i18n } = useTranslation(["weapons"]);

	const cached = allWeaponCategoriesCache.get(i18n.language);
	if (cached) return cached;

	const categories = buildAllWeaponCategories(t);
	if (i18n.hasLoadedNamespace("weapons")) {
		allWeaponCategoriesCache.set(i18n.language, categories);
	}
	return categories;
}

function buildAllWeaponCategories(t: TFunction<["weapons"]>) {
	return weaponCategories.map((category, idx) => ({
		name: category.name,
		key: category.name as string,
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
}

function keyify(value?: MainWeaponId | null) {
	if (typeof value === "number") return `MAIN_${value}`;

	return value;
}
