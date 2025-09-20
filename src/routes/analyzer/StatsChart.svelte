<script lang="ts">
	import type { Ability } from '$lib/constants/in-game/types';
	import type { AnalyzedBuild } from '$lib/core/analyzer/types';
	import type { MainWeaponId, SubWeaponId } from '$lib/constants/in-game/types';
	import type { Stat } from '$lib/core/analyzer/types';
	import type { SubWeaponDamage } from '$lib/core/analyzer/types';
	import { isStackableAbility, isMainOnlyAbility } from '$lib/core/analyzer/utils';
	import { buildStats } from '$lib/core/analyzer/stats';
	import { MAX_AP } from '$lib/constants/analyzer';
	import { nullFilledArray } from '$lib/utils/arrays';
	import { m } from '$lib/paraglide/messages';
	import * as R from 'ramda';
	import LineChart, { type DataSet } from '$lib/components/charts/LineChart.svelte';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';
	import ChartNoAxesCombined from '@lucide/svelte/icons/chart-no-axes-combined';

	interface Props {
		title: string;
		suffix?: string;
		mainWeaponId: MainWeaponId;
		subWeaponId?: SubWeaponId;
		statKey?: keyof AnalyzedBuild['stats'];
		modifiedBy: Ability[];
	}

	let { title, suffix, mainWeaponId, subWeaponId, statKey, modifiedBy }: Props = $props();

	const stackableAbility = $derived(modifiedBy.find(isStackableAbility) ?? 'UNKNOWN');
	const mainOnlyAbility = $derived(modifiedBy.find(isMainOnlyAbility) ?? 'UNKNOWN');

	const dataSets = $derived<DataSet[]>(
		statKey ? statKeyGraphData() : typeof subWeaponId === 'number' ? subDefenseGraphData() : []
	);

	function statKeyGraphData() {
		const dataSets: DataSet[] = [];

		const analyzedBuilds = nullFilledArray(MAX_AP + 1).map((_, i) =>
			buildStats({
				abilityPoints: new Map([[stackableAbility, i]]),
				weaponSplId: mainWeaponId,
				mainOnlyAbilities: [],
				hasTacticooler: false
			})
		);

		dataSets.push({
			metadata: 'INIT',
			label: '',
			data: analyzedBuilds.map((build, i) => ({
				x: i.toString() + m.analyzer_abilityPoints_short(),
				y: (build.stats[statKey!] as Stat).value.toString() ?? '0'
			}))
		});

		if (mainOnlyAbility && mainOnlyAbility !== 'UNKNOWN') {
			const analyzedBuildsMainOnly = nullFilledArray(MAX_AP + 1).map((_, i) =>
				buildStats({
					abilityPoints: new Map([[stackableAbility, i]]),
					weaponSplId: mainWeaponId,
					mainOnlyAbilities: [mainOnlyAbility],
					hasTacticooler: false
				})
			);

			dataSets.push({
				label: mainOnlyAbility,
				data: analyzedBuildsMainOnly.map((build, i) => ({
					x: i.toString() + m.analyzer_abilityPoints_short(),
					y: (build.stats[statKey!] as Stat).value.toString() ?? '0'
				}))
			});
		}

		return dataSets;
	}

	function subDefenseGraphData() {
		const dataSets: DataSet[] = [];

		const analyzedBuilds = nullFilledArray(MAX_AP + 1).map((_, i) =>
			buildStats({
				abilityPoints: new Map([['SRU', i]]),
				weaponSplId: 0,
				mainOnlyAbilities: [],
				hasTacticooler: false
			})
		);

		const distanceKeys = R.uniq(
			analyzedBuilds[0].stats.subWeaponDefenseDamages
				.filter((damage) => damage.subWeaponId === subWeaponId)
				.filter((damage) => damage.value < 100)
				.map((damage) => damageToKey(damage))
		);

		for (const key of distanceKeys) {
			const distance = key.split(',')[0];

			dataSets.push({
				label: `${m.analyzer_damage_header_distance}: ${distance}`,
				data: analyzedBuilds.map((build, i) => {
					const damage = build.stats.subWeaponDefenseDamages.find(
						(d) => d.subWeaponId === subWeaponId && damageToKey(d) === key
					);
					return {
						x: i.toString() + m.analyzer_abilityPoints_short(),
						y: (damage ? damage.value.toString() : '0') + (suffix ?? '')
					};
				})
			});
		}

		return dataSets;
	}

	function damageToKey(damage: SubWeaponDamage) {
		if (typeof damage.distance === 'number') {
			return `${damage.distance},${damage.baseValue}`;
		}

		return `${damage.distance!.join(',')},${damage.baseValue}`;
	}
</script>

<Popover>
	{#snippet trigger()}
		<PopoverTriggerButton class="chart-button" size="small">
			<ChartNoAxesCombined size="16" />
		</PopoverTriggerButton>
	{/snippet}
	<LineChart datasets={dataSets} heading={title}>
		{#snippet tooltip(data)}
			<p {...data.titleStyles}>{data.datasets[0].raw.x}</p>
			{#each data.datasets as dataset, i (i)}
				<span class="tooltip-item" {...dataset.itemStyles}>
					<div class="tooltip-point" {...dataset.pointStyles}></div>
					<p>{dataset.parsed.y}{suffix}</p>
				</span>
			{/each}
		{/snippet}
	</LineChart>
</Popover>
