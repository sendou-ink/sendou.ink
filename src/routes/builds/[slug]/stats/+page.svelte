<script lang="ts">
	import { BuildAPI } from '$lib/api/build/index.js';
	import Ability from '$lib/components/Ability.svelte';
	import WeaponImage from '$lib/components/image/WeaponImage.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { MAX_AP } from '$lib/constants/common';
	import { m } from '$lib/paraglide/messages';
	import { weaponTranslations } from '$lib/utils/i18n';

	let { params } = $props();

	const { stats, weaponId } = $derived(await BuildAPI.statsBySlug(params.slug));

	function apToPx(ap: number) {
		return Math.floor((ap / stats.stackableAbilities[0].apAverage.weapon) * 200);
	}

	function percentageToPx(percentage: number) {
		return Math.floor((percentage / MAX_AP) * 125);
	}

	const weaponNameInEnglish = $derived(weaponTranslations[weaponId]({}, { locale: 'en' }));
</script>

<OpenGraphMeta
	title={`${weaponNameInEnglish} popular abilities`}
	ogTitle={`${weaponNameInEnglish} Splatoon 3 popular abilities`}
	description={`List of the most popular abilities for ${weaponNameInEnglish} in Splatoon 3.`}
/>

<Main halfWidth class="stack lg">
	<div class="text-xs text-lighter font-bold">
		{m.builds_stats_count_title({
			count: stats.weaponBuildsCount,
			weapon: weaponTranslations[weaponId]()
		})}
	</div>

	<div class="stack md">
		<h2 class="text-lg">{m.builds_stats_ap_title()}</h2>
		<div class="stack md">
			{#each stats.stackableAbilities as stat (stat.name)}
				<div class="ability-row">
					<div>
						<Ability ability={stat.name} size="SUB" />
					</div>
					<div class="bars">
						<div>
							<WeaponImage variant="badge" weaponSplId={weaponId} width={22} />
						</div>
						<div>
							{stat.apAverage.weapon.toFixed(2)}
							{m.analyzer_abilityPoints_short()}
						</div>
						<div class="bar" style:width="{apToPx(stat.apAverage.weapon)}px"></div>
						<div class="text-xs text-lighter font-bold justify-self-center">
							{m.builds_stats_all()}
						</div>
						<div>
							{stat.apAverage.all.toFixed(2)}
							{m.analyzer_abilityPoints_short()}
						</div>
						<div class="bar" style:width="{apToPx(stat.apAverage.all)}px"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="stack md">
		<h2 class="text-lg">{m.builds_stats_percentage_title()}</h2>
		<div class="stack md">
			{#each stats.mainOnlyAbilities as stat (stat.name)}
				<div class="ability-row">
					<Ability ability={stat.name} size="SUB" />
					<div class="bars">
						<div>
							<WeaponImage variant="badge" weaponSplId={weaponId} size={22} />
						</div>
						<div>{stat.percentage.weapon}%</div>
						<div class="bar" style:width="{percentageToPx(stat.percentage.weapon)}px"></div>
						<div class="text-xs text-lighter font-bold justify-self-center">
							{m.builds_stats_all()}
						</div>
						<div>{stat.percentage.all}%</div>
						<div class="bar" style:width="{percentageToPx(stat.percentage.all)}px"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</Main>

<style>
	.ability-row {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}

	.bars {
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);
		display: grid;
		align-items: center;
		grid-template-columns: max-content 65px 1fr;
		column-gap: var(--s-2);
		row-gap: var(--s-1);
	}

	.bar {
		background-color: var(--color-primary);
		height: 100%;
	}
</style>
