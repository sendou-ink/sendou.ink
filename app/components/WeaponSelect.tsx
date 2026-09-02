import type { TFunction } from "i18next";
import * as React from "react";
import type { Key } from "react-aria-components";
import { useTranslation } from "react-i18next";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import { Image, WeaponImage } from "~/components/Image";
import type { AnyWeapon } from "~/features/build-analyzer/analyzer-types";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import {
	mainWeaponIds,
	nonDamagingSpecialWeaponIds,
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
	isDisabled,
	placeholder,
}: WeaponSelectProps<Clearable, IncludeSubSpecial>) {
	const { t } = useTranslation(["common"]);
	const selectedWeaponId: MainWeaponId | null =
		typeof value === "number"
			? (value as MainWeaponId)
			: value && typeof value === "object" && value.type === "MAIN"
				? (value.id as MainWeaponId)
				: null;
	const isControlled = value !== undefined;
	const [isOpen, setIsOpen] = React.useState(false);
	const [lastUncontrolledKey, setLastUncontrolledKey] = React.useState<
		string | null
	>(() => keyify(initialValue) ?? null);
	const selectedKey = isControlled ? keyify(value) : lastUncontrolledKey;
	const { items, filterValue, setFilterValue } = useWeaponItems({
		includeSubSpecial,
		quickSelectWeaponsIds,
		selectedWeaponId,
		isOpen,
		selectedKey,
	});
	const filter = useWeaponFilter();

	const handleOnChange = (key: Key | null) => {
		if (!isControlled) {
			setLastUncontrolledKey(key === null ? null : String(key));
		}
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
			isDisabled={isDisabled}
			items={items}
			label={label}
			placeholder={placeholder ?? t("common:forms.weaponSearch.placeholder")}
			search={{
				placeholder: t("common:forms.weaponSearch.search.placeholder"),
			}}
			searchInputValue={filterValue}
			onSearchInputChange={setFilterValue}
			onOpenChange={setIsOpen}
			selectedKey={isControlled ? keyify(value) : undefined}
			defaultSelectedKey={
				isControlled ? undefined : (keyify(initialValue) as Key)
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
					headingImgPath={
						key === "quick-select"
							? undefined
							: name === "subs"
								? subWeaponImageUrl(SPLAT_BOMB_ID)
								: name === "specials"
									? specialWeaponImageUrl(TRIZOOKA_ID)
									: weaponCategoryUrl(name)
					}
					className={idx === 0 ? "pt-0-5" : undefined}
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

const weaponNameToWeaponMapCache = new Map<string, Map<string, AnyWeapon>>();

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
	const map = new Map<string, AnyWeapon>();

	for (const id of mainWeaponIds) {
		map.set(t(`weapons:MAIN_${id}`), { id, type: "MAIN" });
	}

	for (const id of subWeaponIds) {
		map.set(t(`weapons:SUB_${id}`), { id, type: "SUB" });
	}

	for (const id of specialWeaponIds) {
		map.set(t(`weapons:SPECIAL_${id}`), { id, type: "SPECIAL" });
	}

	return map;
}

function useWeaponItems({
	includeSubSpecial,
	quickSelectWeaponsIds,
	selectedWeaponId,
	isOpen,
	selectedKey,
}: {
	includeSubSpecial: boolean | undefined;
	quickSelectWeaponsIds?: Array<MainWeaponId>;
	selectedWeaponId?: MainWeaponId | null;
	isOpen: boolean;
	selectedKey: string | null | undefined;
}) {
	const items = useAllWeaponCategories(includeSubSpecial);
	const [filterValue, setFilterValue] = React.useState("");
	const { t } = useTranslation(["common"]);

	// react-aria renders every item into a hidden collection even while closed,
	// when only the selected item (the trigger's value) is needed
	if (!isOpen) {
		return {
			items: collapseToSelectedItem(items, selectedKey),
			filterValue,
			setFilterValue,
		};
	}

	const showQuickSelectWeapons =
		filterValue === "" && quickSelectWeaponsIds?.length;

	if (showQuickSelectWeapons) {
		const weaponIdsToInclude = new Set(quickSelectWeaponsIds);
		if (typeof selectedWeaponId === "number") {
			weaponIdsToInclude.add(selectedWeaponId);
		}

		const quickSelectCategory = {
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
					weaponIdsToInclude.has(item.weapon.id as MainWeaponId),
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

function useAllWeaponCategories(withSubSpecial = false) {
	const { t, i18n } = useTranslation(["weapons"]);

	const cacheKey = `${i18n.language}-${withSubSpecial}`;
	const cached = allWeaponCategoriesCache.get(cacheKey);
	if (cached) return cached;

	const categories = buildAllWeaponCategories(t, withSubSpecial);
	if (i18n.hasLoadedNamespace("weapons")) {
		allWeaponCategoriesCache.set(cacheKey, categories);
	}
	return categories;
}

function buildAllWeaponCategories(
	t: TFunction<["weapons"]>,
	withSubSpecial: boolean,
) {
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
		items: specialWeaponIds
			// currently no use-case exists to select big bubbler or tacticooler
			.filter((id) => !nonDamagingSpecialWeaponIds.includes(id))
			.map((id) => ({
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

function keyify(value?: MainWeaponId | AnyWeapon | null) {
	if (typeof value === "number") return `MAIN_${value}`;
	if (!value) return value;

	return `${value.type}_${value.id}`;
}

function collapseToSelectedItem<
	Category extends { items: Array<{ weapon: { anyWeaponId: string } }> },
>(categories: Category[], selectedKey: string | null | undefined): Category[] {
	// react-stately refuses to open a select with an empty collection, so one item is always kept
	const fallbackItems = () => {
		const firstCategory = categories[0];
		if (!firstCategory) return [];
		return [
			{ ...firstCategory, items: firstCategory.items.slice(0, 1) } as Category,
		];
	};

	if (!selectedKey) return fallbackItems();

	for (const category of categories) {
		const selectedItem = category.items.find(
			(item) => item.weapon.anyWeaponId === selectedKey,
		);
		if (selectedItem) {
			return [{ ...category, items: [selectedItem] } as Category];
		}
	}

	return fallbackItems();
}
