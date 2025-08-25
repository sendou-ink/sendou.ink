<script lang="ts">
	import type {
		BuildAbilitiesTupleWithUnknown,
		AbilityWithUnknown,
		AbilityType
	} from '$lib/constants/in-game/types';
	import type { AbilityItem } from './types';
	import { abilities as abilitiesList } from '$lib/constants/in-game/abilities';
	import AbilitySlot from './AbilitySlot.svelte';
	import AbilitySelector from './AbilitySelector.svelte';

	interface Props {
		abilities?: BuildAbilitiesTupleWithUnknown;
	}

	const emptyBuild: BuildAbilitiesTupleWithUnknown = [
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']
	];

	let mainAbilities: AbilityItem[] = abilitiesList
		.filter((ability) => ability.type !== 'STACKABLE')
		.map((ability, i) => ({
			id: `main_${i}`,
			abilityType: ability.type,
			ability: ability.name
		}));

	let stackableAbilities: AbilityItem[] = abilitiesList
		.filter((ability) => ability.type === 'STACKABLE')
		.map((ability, i) => ({
			id: `stack_${i}`,
			abilityType: ability.type,
			ability: ability.name
		}));

	let { abilities = $bindable([...emptyBuild]) }: Props = $props();

	function slotTypeFromIndex(i: number, j: number) {
		if (i === 0 && j === 0) return 'HEAD_MAIN_ONLY';
		if (i === 1 && j === 0) return 'CLOTHES_MAIN_ONLY';
		if (i === 2 && j === 0) return 'SHOES_MAIN_ONLY';
		return 'STACKABLE';
	}

	function abilityTypeFromName(ability: AbilityWithUnknown) {
		const main = mainAbilities.find((item) => item.ability === ability);
		if (main) return main.abilityType;
		return 'STACKABLE';
	}

	function addAbility(ability: AbilityItem) {
		for (let i = 0; i < abilities.length; i++) {
			for (let j = 0; j < abilities[i].length; j++) {
				if (
					abilities[i][j] === 'UNKNOWN' &&
					(ability.abilityType === 'STACKABLE' || ability.abilityType === slotTypeFromIndex(i, j))
				) {
					abilities[i][j] = ability.ability;
					return;
				}
			}
		}
	}

	let enabledSlots = $state<AbilityType>('STACKABLE');

	function updateEnabledSlots(ability: AbilityItem | undefined) {
		if (!ability || ability.abilityType === 'STACKABLE') {
			enabledSlots = 'STACKABLE';
			return;
		}

		enabledSlots = ability.abilityType;
	}

	let disabledAbilities: AbilityType[] = $derived.by(() => {
		const temp: AbilityType[] = [];

		abilities[0][0] !== 'UNKNOWN' ? temp.push('HEAD_MAIN_ONLY') : null;
		abilities[1][0] !== 'UNKNOWN' ? temp.push('CLOTHES_MAIN_ONLY') : null;
		abilities[2][0] !== 'UNKNOWN' ? temp.push('SHOES_MAIN_ONLY') : null;
		abilities.flat().filter((a) => a !== 'UNKNOWN').length >= 12 ? temp.push('STACKABLE') : null;

		return temp;
	});
</script>

<div class="container">
	<div class="slots">
		{#each abilities as row, i}
			{#each row as item, j}
				{@const abilityType = abilityTypeFromName(item)}
				{@const slotType = slotTypeFromIndex(i, j)}
				<AbilitySlot
					abilities={[
						{
							id: Math.floor(Math.random() * 10000000000).toString(),
							abilityType,
							ability: item
						}
					]}
					{slotType}
					disabled={enabledSlots !== 'STACKABLE' && enabledSlots !== slotType}
					ondrag={(ability) => updateEnabledSlots(ability)}
					onchange={(ability) => {
						abilities[i][j] = ability;
					}}
				/>
			{/each}
		{/each}
	</div>

	<AbilitySelector
		abilities={stackableAbilities}
		{disabledAbilities}
		ondrag={(ability) => updateEnabledSlots(ability)}
		onclick={(ability) => addAbility(ability)}
	/>
	<AbilitySelector
		abilities={mainAbilities}
		{disabledAbilities}
		ondrag={(ability) => updateEnabledSlots(ability)}
		onclick={(ability) => addAbility(ability)}
	/>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-3);
	}
	.slots {
		display: grid;
		grid-template-columns: repeat(4, fit-content(100%));
		gap: var(--s-2) var(--s-1-5);
		place-items: center;
	}
</style>
