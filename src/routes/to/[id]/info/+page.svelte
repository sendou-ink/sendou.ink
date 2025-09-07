<script lang="ts">
	import { resolve } from '$app/paths';
	import * as TournamentAPI from '$lib/api/tournament';
	import Avatar from '$lib/components/Avatar.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import { modesShortTranslations } from '$lib/utils/i18n';
	import type { PageProps } from './$types';
	import TournamentTimes from './TournamentTimes.svelte';
	import { m } from '$lib/paraglide/messages';

	let { params }: PageProps = $props();
	const tournament = $derived(await TournamentAPI.queries.infoById(params.id));

	const quickInfos = $derived(
		[
			tournament.infos.isRanked ? m.deft_red_platypus_fall() : m.front_showcase_card_unranked(),
			`${tournament.infos.minMembersPerTeam}v${tournament.infos.minMembersPerTeam}`,
			tournament.infos.modes.map((mode) => modesShortTranslations[mode]()).join('/'),
			tournament.infos.isSkillCapped ? m.common_tag_name_LOW() : null
		].filter((value) => value !== null)
	);
</script>

<!-- xxx: register now button -->

<div class="main stack md-plus">
	<div class="stack sm items-center justify-center">
		<img src={tournament.logoSrc} alt="" class="tournament-logo" />
		<div>
			<h2>{tournament.name}</h2>
			{#if tournament.organization}
				<div class="org">
					{#if tournament.organization.logoSrc}
						<img src={tournament.organization.logoSrc} alt="" class="org-logo" />
					{/if}
					<a href={resolve('/org/[slug]', { slug: tournament.organization.slug })}>
						{tournament.organization.name}
					</a>
				</div>
			{:else}
				<div class="org">
					{#if tournament.author.discordAvatar}
						<Avatar size="xxs" user={tournament.author} />
					{/if}
					<a
						href={resolve('/u/[identifier]', {
							identifier: tournament.author.customUrl ?? tournament.author.discordId
						})}
					>
						{tournament.author.username}
					</a>
				</div>
			{/if}
		</div>
	</div>

	<div class="quick-infos">
		{#each quickInfos as info, i (info)}
			<span class="badge">{info}</span>
			{#if i < quickInfos.length - 1}
				<div class="line"></div>
			{/if}
		{/each}
	</div>

	<TournamentTimes times={tournament.times} />
	{#if tournament.description}
		<Markdown content={tournament.description} />
	{/if}
</div>

<style>
	.tournament-logo {
		border-radius: 100%;
		height: 7.5rem;
	}

	.org {
		display: flex;
		align-items: center;
		justify-self: center;
		gap: var(--s-1);
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);

		a {
			color: var(--color-base-content-secondary);
		}

		img {
			border-radius: 100%;
			height: 24px;
		}
	}

	.quick-infos {
		display: flex;
		gap: var(--s-2-5);
		flex-wrap: wrap;
		justify-content: center;
		font-weight: var(--semi-bold);
		text-transform: uppercase;
		font-size: var(--fonts-xs);
		color: var(--color-secondary);
	}

	.line {
		width: 3px;
		background-color: var(--color-secondary-transparent);
		flex-shrink: 0;
		border-radius: 2px;
	}
</style>
