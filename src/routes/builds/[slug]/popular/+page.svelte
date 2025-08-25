<script lang="ts">
	import * as BuildAPI from '$lib/api/build/index.js';
	import Ability from '$lib/components/builder/Ability.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { builds_noPopularBuilds, m } from '$lib/paraglide/messages';
	import { weaponTranslations } from '$lib/utils/i18n';

	let { params } = $props();

	const { popular, weaponId } = $derived(
		await BuildAPI.queries.popularAbilitiesBySlug(params.slug)
	);

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
