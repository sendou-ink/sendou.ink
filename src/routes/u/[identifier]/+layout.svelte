<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import Main from '$lib/components/layout/Main.svelte';
	import SubNav from '$lib/components/sub-nav/SubNav.svelte';
	import SubNavLink from '$lib/components/sub-nav/SubNavLink.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import * as UserAPI from '$lib/api/user';
	import * as AuthAPI from '$lib/api/auth';

	interface Props extends PageProps {
		children: Snippet;
	}

	let { children, params }: Props = $props();

	const loggedInUser = $derived(await AuthAPI.queries.me()); // xxx: await_waterfall
	const user = $derived((await UserAPI.queries.layoutDataByIdentifier(params.identifier)).user);

	const isOwnPage = $derived(loggedInUser?.id === user.id);
	const isResultsPage = $derived(page.url.pathname.includes('results'));
</script>

{#snippet template()}
	<OpenGraphMeta
		title={user.username}
		description={`${user.username}'s profile on sendou.ink including builds, tournament results, art and more.`}
	/>

	<Main bigger={isResultsPage}>
		<SubNav>
			<SubNavLink href={resolve(`/u/${params.identifier}`)} data-testid="user-profile-tab">
				{m.common_header_profile()}
			</SubNavLink>
			<SubNavLink href={resolve(`/u/${params.identifier}/seasons`)} data-testid="user-seasons-tab">
				{m.user_seasons()}
			</SubNavLink>
			{#if isOwnPage}
				<SubNavLink href={resolve(`/u/${params.identifier}/edit`)} data-testid="user-edit-tab">
					{m.common_actions_edit()}
				</SubNavLink>
			{/if}
			{#if user.resultsCount > 0}
				<SubNavLink
					href={resolve(`/u/${params.identifier}/results`)}
					data-testid="user-results-tab"
				>
					{m.common_results()} ({user.resultsCount})
				</SubNavLink>
			{/if}
			{#if user.buildsCount > 0 || isOwnPage}
				<SubNavLink href={resolve(`/u/${params.identifier}/builds`)} data-testid="user-builds-tab">
					{m.common_pages_builds()} ({user.buildsCount})
				</SubNavLink>
			{/if}
			{#if user.vodsCount > 0 || isOwnPage}
				<SubNavLink href={resolve(`/u/${params.identifier}/vods`)} data-testid="user-vods-tab">
					{m.common_pages_vods()} ({user.vodsCount})
				</SubNavLink>
			{/if}
			{#if user.artCount > 0 || isOwnPage}
				<SubNavLink
					href={resolve(`/u/${params.identifier}/art`)}
					end={false}
					data-testid="user-art-tab"
				>
					{m.common_pages_art()} ({user.artCount})
				</SubNavLink>
			{/if}
			{#if loggedInUser?.roles.includes('STAFF')}
				<SubNavLink href={resolve(`/u/${params.identifier}/admin`)} data-testid="user-admin-tab"
					>Admin</SubNavLink
				>
			{/if}
		</SubNav>
		{@render children()}
	</Main>
{/snippet}

{@render template()}
