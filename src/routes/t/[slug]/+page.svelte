<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as TeamAPI from '$lib/api/team';
	import InviteJoinDialog from '$lib/components/InviteJoinDialog.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { m } from '$lib/paraglide/messages';
	import { userSubmittedImage } from '$lib/utils/urls-img';
	import ResultsBanner from './ResultsBanner.svelte';
	import TeamMemberInfo from './TeamMemberInfo.svelte';
	import { page } from '$app/state';

	let { params } = $props();

	const inviteCode = $derived(page.url.searchParams.get('code'));

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

{#if inviteCode}
	<InviteJoinDialog
		dialogTitle={m.team_validation_VALID({ teamName: team.name })}
		validation={await TeamAPI.queries.validateInviteCode({ inviteCode, slug: params.slug })}
		onConfirm={async () => {
			await TeamAPI.actions.joinTeam({ inviteCode, slug: params.slug });
			goto(resolve('/t/[slug]', { slug: team.customUrl }));
		}}
		confirmPending={TeamAPI.actions.joinTeam.pending > 0}
	/>
{/if}

<div class="stack lg">
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
