<script lang="ts">
	import { dndzone, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import type { AbilityItem } from './types';
	import Ability from '$lib/components/Ability.svelte';

	interface Props {
		abilities: AbilityItem[];
		ondrag: (ability: AbilityItem | undefined) => void;
		onclick: (ability: AbilityItem) => void;
	}

	let { abilities, onclick, ondrag }: Props = $props();

	function onconsider(event: CustomEvent<DndEvent<AbilityItem>>) {
		const { trigger, id } = event.detail.info;

		if (trigger === TRIGGERS.DRAG_STARTED) {
			const draggedAbility = abilities.find((ability) => ability.id === id);
			ondrag(draggedAbility);

			const idIndex = abilities.findIndex((item) => item.id === id);
			const prefix = id.toString().split('_')[0];
			const idNumber = id.toString().split('_')[1];
			const suffix = id.split('_')[2] ?? '0';
			const newId = `${prefix}_${idNumber}_${+suffix + +'1'}`;

			event.detail.items = event.detail.items.filter(
				(item) => !item.hasOwnProperty('isDndShadowItem')
			);

			event.detail.items.splice(idIndex, 0, { ...abilities[idIndex], id: newId });
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
		<Ability ability={ability.ability} size="SUB" onclick={() => onclick(ability)} />
	{/each}
</div>

<style>
	div {
		display: flex;
	}
</style>
