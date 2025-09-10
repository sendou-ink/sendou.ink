<script lang="ts">
	import type { LayoutProps } from './$types';
	import Main from '$lib/components/layout/Main.svelte';
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import * as TournamentAPI from '$lib/api/tournament';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { removeMarkdown } from '$lib/utils/strings';
	import { getLocale } from '$lib/paraglide/runtime';
	import ListPlus from '@lucide/svelte/icons/list-plus';
	import Scale from '@lucide/svelte/icons/scale';
	import Trophy from '@lucide/svelte/icons/trophy';
	import SquareSplitHorizontal from '@lucide/svelte/icons/square-split-horizontal';
	import Users from '@lucide/svelte/icons/users';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import SideNavItem from '$lib/components/layout/SideNavItem.svelte';
	import Handshake from '@lucide/svelte/icons/handshake';
	import Tv from '@lucide/svelte/icons/tv';
	import SubSideNav from '$lib/components/layout/SubSideNav.svelte';
	import SubSideNavLink from '$lib/components/layout/SubSideNavLink.svelte';
	import type { ResolvedPathname } from '$app/types';
	import SideNavHeader from '$lib/components/layout/SideNavHeader.svelte';

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
	{#snippet sideNavHeading()}
		<SideNavHeader
			href={resolve(`/to/${params.id}/info`)}
			imgSrc={tournament.logoSrc}
			heading={tournament.name}
			subheading={tournament.times.startsAt.toLocaleString(getLocale(), {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			})}
		/>
	{/snippet}
	{#snippet sideNav()}
		{#if tabs.has('register')}
			<!-- xxx: handle redirect to tournament.ctx.parentTournamentId on register page if needed -->
			<!-- xxx: show (!) if reg is not complete? -->
			<SideNavItem href={resolve(`/to/${params.id}/register`)} data-testid="register-tab">
				{#snippet icon()}
					<ListPlus />
				{/snippet}
				{m.tournament_tabs_register()}
			</SideNavItem>
		{/if}

		{#if tabs.has('rules')}
			<SideNavItem href={resolve(`/to/${params.id}/rules`)} data-testid="rules-tab">
				{#snippet icon()}
					<Scale />
				{/snippet}
				{m.q_front_nav_rules_title()}
			</SideNavItem>
		{/if}

		{#if tabs.has('brackets')}
			<div>
				<SideNavItem>
					{#snippet icon()}
						<Trophy />
					{/snippet}
					{m.tournament_tabs_brackets()}
				</SideNavItem>
				<SubSideNav>
					{#each tournament.brackets as bracket, idx (bracket)}
						<SubSideNavLink href={resolve(`/to/${params.id}/brackets/${idx}`)}>
							{bracket}
						</SubSideNavLink>
					{/each}
				</SubSideNav>
			</div>
		{/if}

		{#if tabs.has('streams')}
			<SideNavItem
				href={resolve(`/to/${params.id}/streams`)}
				data-testid="streams-tab"
				number={counts.streams}
			>
				{#snippet icon()}
					<Tv />
				{/snippet}
				{m.q_front_nav_streams_title()}
			</SideNavItem>
		{/if}

		<!-- xxx: handle redirect to tournament.ctx.parentTournamentId on divisons page if needed -->
		{#if tabs.has('divisions')}
			<SideNavItem href={resolve(`/to/${params.id}/divisions`)} data-testid="divisions-tab">
				{#snippet icon()}
					<SquareSplitHorizontal />
				{/snippet}
				{m.topical_due_pigeon_enrich()}
			</SideNavItem>
		{/if}

		{#if tabs.has('teams')}
			<SideNavItem
				href={resolve(`/to/${params.id}/teams`)}
				number={counts.teams}
				data-testid="teams-tab"
			>
				{#snippet icon()}
					<Users />
				{/snippet}
				{m.common_pages_t()}
			</SideNavItem>
		{/if}

		{#if tabs.has('subs')}
			<SideNavItem
				href={resolve(`/to/${params.id}/subs`)}
				number={counts.subs}
				data-testid="subs-tab"
			>
				{#snippet icon()}
					<Handshake />
				{/snippet}
				Matchmaking
			</SideNavItem>
		{/if}

		{#if tabs.has('results')}
			<SideNavItem href={resolve(`/to/${params.id}/results`)} data-testid="results-tab">
				{#snippet icon()}
					<ListOrdered />
				{/snippet}
				{m.tournament_tabs_results()}
			</SideNavItem>
		{/if}

		{#if tabs.has('admin')}
			<div>
				<SideNavItem>
					{#snippet icon()}
						<KeyRound />
					{/snippet}
					{m.tournament_tabs_admin()}
				</SideNavItem>
				<SubSideNav>
					<SubSideNavLink href={resolve(`/to/${params.id}/admin/staff`)}>Staff</SubSideNavLink>
					<SubSideNavLink href={resolve(`/to/${params.id}/admin/teams`)}>Teams</SubSideNavLink>
					<SubSideNavLink href={resolve(`/to/${params.id}/admin/players`)}>Players</SubSideNavLink>
					<SubSideNavLink href={(resolve('/to/new') + `?id=${params.id}`) as ResolvedPathname}
						>Edit</SubSideNavLink
					>
				</SubSideNav>
			</div>
		{/if}
	{/snippet}
	{@render children()}
</Main>
