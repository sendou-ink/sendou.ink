<script lang="ts">
	import type { AbilityItem } from './types';
	import type { AbilityType } from '$lib/constants/in-game/types';
	import { dndzone, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import Ability from './Ability.svelte';

	interface Props {
		abilities: AbilityItem[];
		disabledAbilities: AbilityType[];
		ondrag: (ability: AbilityItem | undefined) => void;
		onclick: (ability: AbilityItem) => void;
	}

	let { abilities, disabledAbilities, onclick, ondrag }: Props = $props();

	function createDuplicateItem(item: AbilityItem): AbilityItem {
		const [prefix, idNumber, suffix = '0'] = item.id.split('_');
		const newSuffix = String(Number(suffix) + 1);
		return { ...item, id: `${prefix}_${idNumber}_${newSuffix}` };
	}

	function onconsider(event: CustomEvent<DndEvent<AbilityItem>>) {
		const { trigger, id } = event.detail.info;

		if (trigger === TRIGGERS.DRAG_STARTED) {
			const draggedAbility = abilities.find((ability) => ability.id === id);
			ondrag(draggedAbility);

			const itemIndex = abilities.findIndex((item) => item.id === id);
			const duplicateItem = createDuplicateItem(abilities[itemIndex]);

			event.detail.items = event.detail.items.filter(
				(item) => !Object.hasOwn(item, 'isDndShadowItem')
			);

			event.detail.items.splice(itemIndex, 0, duplicateItem);
			abilities = event.detail.items;
		} else {
			abilities = [...abilities];
		}
	}

	function onfinalize(event: CustomEvent<DndEvent<AbilityItem>>) {
		ondrag(undefined);
		abilities = event.detail.items;
	}
</script>

<div
	use:dndzone={{
		items: abilities,
		flipDurationMs: 200,
		dropFromOthersDisabled: true,
		zoneTabIndex: -1,
		zoneItemTabIndex: -1,
		dropTargetStyle: {}
	}}
	{onconsider}
	{onfinalize}
>
	{#each abilities as ability (ability.id)}
		<Ability
			ability={ability.ability}
			size="SUB"
			onclick={() => onclick(ability)}
			disabled={disabledAbilities.includes(ability.abilityType)}
		/>
	{/each}
</div>

<style>
	div {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-1-5);
	}
</style>
