<script lang="ts">
	import type { LayoutProps } from './$types';
	import Main from '$lib/components/layout/Main.svelte';
	import SubNav from '$lib/components/sub-nav/SubNav.svelte';
	import SubNavLink from '$lib/components/sub-nav/SubNavLink.svelte';
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import * as TournamentAPI from '$lib/api/tournament';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { removeMarkdown } from '$lib/utils/strings';

	interface Props extends LayoutProps {
		children: Snippet;
	}

	let { children, params }: Props = $props();

	const tournament = $derived(await TournamentAPI.queries.infoById(params.id));
	const { tabs, counts } = $derived(await TournamentAPI.queries.tabsById(params.id));
</script>

<OpenGraphMeta
	title={tournament.name}
	description={tournament.description ? removeMarkdown(tournament.description) : undefined}
	image={{
		url: tournament.logoSrc,
		dimensions: { width: 124, height: 124 }
	}}
/>

<Main bigger>
	<SubNav>
		{#if tabs.has('register')}
			<!-- xxx: handle redirect to tournament.ctx.parentTournamentId on register page if needed -->
			<SubNavLink
				href={resolve('/to/[id]/register', { id: String(params.id) })}
				data-testid="register-tab"
			>
				{m.tournament_tabs_register()}
			</SubNavLink>
		{/if}
		{#if tabs.has('info')}
			<SubNavLink href={resolve('/to/[id]/info', { id: String(params.id) })} data-testid="info-tab">
				{m.q_front_nav_info_title()}
			</SubNavLink>
		{/if}
		{#if tabs.has('rules')}
			<SubNavLink
				href={resolve('/to/[id]/rules', { id: String(params.id) })}
				data-testid="rules-tab"
			>
				{m.q_front_nav_rules_title()}
			</SubNavLink>
		{/if}
		{#if tabs.has('brackets')}
			<SubNavLink
				href={resolve('/to/[id]/brackets', { id: String(params.id) })}
				data-testid="brackets-tab"
			>
				{m.tournament_tabs_brackets()}
			</SubNavLink>
		{/if}
		<!-- xxx: handle redirect to tournament.ctx.parentTournamentId on divisons page if needed -->
		{#if tabs.has('divisions')}
			<SubNavLink
				href={resolve('/to/[id]/divisions', { id: String(params.id) })}
				data-testid="divisions-tab"
			>
				{m.topical_due_pigeon_enrich()}
			</SubNavLink>
		{/if}
		{#if tabs.has('teams')}
			<SubNavLink
				href={resolve('/to/[id]/teams', { id: String(params.id) })}
				data-testid="teams-tab"
			>
				{m.tournament_tabs_teams({ count: counts.teams })}
			</SubNavLink>
		{/if}
		{#if tabs.has('subs')}
			<SubNavLink href={resolve('/to/[id]/subs', { id: String(params.id) })} data-testid="subs-tab">
				{m.tournament_tabs_subs({ count: counts.subs })}
			</SubNavLink>
		{/if}
		{#if tabs.has('streams')}
			<SubNavLink
				href={resolve('/to/[id]/streams', { id: String(params.id) })}
				data-testid="streams-tab"
			>
				{m.tournament_tabs_streams({ count: counts.streams })}
			</SubNavLink>
		{/if}
		{#if tabs.has('results')}
			<SubNavLink
				href={resolve('/to/[id]/results', { id: String(params.id) })}
				data-testid="results-tab"
			>
				{m.tournament_tabs_results()}
			</SubNavLink>
		{/if}
		{#if tabs.has('admin')}
			<SubNavLink
				href={resolve('/to/[id]/admin', { id: String(params.id) })}
				data-testid="admin-tab"
			>
				{m.tournament_tabs_admin()}
			</SubNavLink>
		{/if}
	</SubNav>
	{@render children()}
</Main>
