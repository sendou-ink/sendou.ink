<script lang="ts">
	import Ability from '$lib/components/ability.svelte';
	import Main from '$lib/components/main.svelte';
	import OpenGraphMeta from '$lib/components/open-graph-meta.svelte';
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import { builds_noPopularBuilds, m } from '$lib/paraglide/messages';
	import { weaponTranslations } from '$lib/utils/i18n';
	import { popularAbilitiesBySlug } from './popular-abilities-by-slug.remote';

	let { params } = $props();

	const { popular, weaponId } = $derived(
		await popularAbilitiesBySlug(params.slug as unknown as MainWeaponId)
	); // xxx: https://github.com/sveltejs/kit/issues/14083

	const weaponNameInEnglish = $derived(weaponTranslations[weaponId]({}, { locale: 'en' }));
</script>

<OpenGraphMeta
	title={`${weaponNameInEnglish} popular builds`}
	ogTitle={`${weaponNameInEnglish} Splatoon 3 popular builds`}
	description={`List of most popular ability combinations for ${weaponNameInEnglish}.`}
/>

<Main class="stack lg">
	{#each popular as build, i (build.id)}
		<div class="stack horizontal lg items-center">
			<div
				class={[
					'stack items-center',
					{
						invisible: !build.count
					}
				]}
			>
				<div class="text-lg text-lighter font-bold">#{i + 1}</div>
				<div class="text-sm font-semi-bold text-theme">
					×{build.count}
				</div>
			</div>

			<div class="stack horizontal md flex-wrap">
				{#each build.abilities as { ability, count } (ability)}
					<div class="text-sm font-semi-bold stack xs items-center">
						<Ability {ability} size="SUB" />
						<div class={{ invisible: !count }}>
							{count}{m.analyzer_abilityPoints_short()}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="text-lg text-lighter text-center">
			{builds_noPopularBuilds()}
		</div>
	{/each}
</Main>
