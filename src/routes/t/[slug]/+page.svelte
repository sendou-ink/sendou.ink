<script lang="ts">
	import { resolve } from '$app/paths';
	import * as TeamAPI from '$lib/api/team';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { userSubmittedImage } from '$lib/utils/urls-img';
	import ResultsBanner from './ResultsBanner.svelte';
	import TeamMemberInfo from './TeamMemberInfo.svelte';

	let { params } = $props();

	const { team, results } = $derived(await TeamAPI.queries.bySlug(params.slug));
</script>

<OpenGraphMeta
	title={team.name}
	description={team.bio}
	image={team.avatarSrc
		? {
				url: userSubmittedImage(team.avatarSrc),
				dimensions: {
					width: 124,
					height: 124
				}
			}
		: undefined}
/>

<div class="stack lg">
	<!-- <ActionButtons />  -->
	{#if results}
		<ResultsBanner
			{results}
			resultsPageHref={resolve('/t/[slug]/results', { slug: team.customUrl })}
		/>
	{/if}
	{#if team.bio}
		<article data-testid="team-bio" class="whitespace-pre-wrap">{team.bio}</article>
	{/if}
	<div class="stack lg">
		{#each team.members as member, i (member.discordId)}
			<TeamMemberInfo {member} number={i} />
		{/each}
	</div>
</div>
