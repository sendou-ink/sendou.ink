<script lang="ts">
import { Select, SelectItem, SelectItemSection } from "@sendou/components";
import type { MainWeaponId } from "@sendou/in-game-lists/types";
import { filterWeapon } from "@sendou/in-game-lists/utils";
import { weaponCategories } from "@sendou/in-game-lists/weapon-ids";
import { mainWeaponName } from "#lib/modules/i18n/messages.ts";
import { m } from "#lib/paraglide/messages.js";
import { weaponCategoryUrl } from "#lib/utils/urls.ts";
import Image from "./Image.svelte";
import WeaponImage from "./WeaponImage.svelte";

interface Props {
	label?: string;
	value?: MainWeaponId | null;
	initialValue?: MainWeaponId;
	onChange?: (weaponId: MainWeaponId | null) => void;
	clearable?: boolean;
	disabledWeaponIds?: Array<MainWeaponId>;
	testId?: string;
	isRequired?: boolean;
	/** If set, selection of weapons that user sees when search input is empty allowing for quick select for e.g. previous selections */
	quickSelectWeaponsIds?: Array<MainWeaponId>;
	isDisabled?: boolean;
	placeholder?: string;
}

let {
	label,
	value,
	initialValue,
	onChange,
	clearable,
	disabledWeaponIds,
	testId = "weapon-select",
	isRequired,
	quickSelectWeaponsIds,
	isDisabled,
	placeholder,
}: Props = $props();

// svelte-ignore state_referenced_locally -- controlled vs. uncontrolled is decided once at mount
const isControlled = value !== undefined;

let searchValue = $state("");

const allCategories = $derived(
	weaponCategories.map((category) => ({
		name: category.name,
		items: category.weaponIds.map((id) => ({
			id: id as MainWeaponId,
			name: mainWeaponName(id),
		})),
	})),
);

const visibleCategories = $derived.by(() => {
	if (searchValue === "" && quickSelectWeaponsIds?.length) {
		const weaponIdsToInclude = new Set(quickSelectWeaponsIds);
		if (typeof value === "number") {
			weaponIdsToInclude.add(value);
		}

		return [
			{
				name: m.common_forms_weaponSearch_quickSelect(),
				isQuickSelect: true,
				items: allCategories
					.flatMap((category) => category.items)
					.filter((item) => weaponIdsToInclude.has(item.id))
					.sort(
						(a, b) =>
							quickSelectWeaponsIds.indexOf(a.id) -
							quickSelectWeaponsIds.indexOf(b.id),
					),
			},
		];
	}

	if (searchValue === "") {
		return allCategories.map((category) => ({
			...category,
			isQuickSelect: false,
		}));
	}

	return allCategories
		.map((category) => ({
			...category,
			isQuickSelect: false,
			items: category.items.filter((item) =>
				filterWeapon({
					weapon: { id: item.id, type: "MAIN" },
					weaponName: item.name,
					searchTerm: searchValue,
				}),
			),
		}))
		.filter((category) => category.items.length > 0);
});

function handleSelectionChange(key: string | number | null) {
	onChange?.(key === null ? null : (Number(key) as MainWeaponId));
}
</script>

<Select
	{label}
	aria-label={!label ? m.common_forms_weaponSearch_placeholder() : undefined}
	{isDisabled}
	{isRequired}
	placeholder={placeholder ?? m.common_forms_weaponSearch_placeholder()}
	search={{ placeholder: m.common_forms_weaponSearch_search_placeholder() }}
	bind:searchValue
	selectedKey={isControlled ? (value ?? null) : undefined}
	defaultSelectedKey={isControlled ? undefined : initialValue}
	onSelectionChange={handleSelectionChange}
	{clearable}
	{testId}
	noResultsText={m.common_noResults()}
>
	{#snippet valueContent(selectedKey)}
		<span class="item">
			<WeaponImage
				weaponSplId={Number(selectedKey) as MainWeaponId}
				variant="build"
				size={24}
				class="weaponImg"
			/>
			<span class="weaponLabel">
				{mainWeaponName(Number(selectedKey))}
			</span>
		</span>
	{/snippet}
	{#each visibleCategories as category, idx (category.name)}
		<SelectItemSection
			heading={category.name}
			class={idx === 0 ? "pt-0-5" : undefined}
		>
			{#snippet headingImg()}
				{#if !category.isQuickSelect}
					<Image path={weaponCategoryUrl(category.name)} size={28} alt="" />
				{/if}
			{/snippet}
			{#each category.items as item (item.id)}
				<SelectItem
					id={item.id}
					textValue={item.name}
					isDisabled={disabledWeaponIds?.includes(item.id)}
				>
					<div class="item">
						<WeaponImage
							weaponSplId={item.id}
							variant="build"
							size={24}
							class="weaponImg"
						/>
						<span
							class="weaponLabel"
							data-testid="weapon-select-option-{item.name}"
						>
							{item.name}
						</span>
					</div>
				</SelectItem>
			{/each}
		</SelectItemSection>
	{/each}
</Select>

<style>
	.item {
		display: flex;
		gap: var(--s-2);
		align-items: center;
	}

	.item :global(.weaponImg) {
		min-width: 24px;
	}

	.weaponLabel {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		min-width: 0;
	}
</style>
