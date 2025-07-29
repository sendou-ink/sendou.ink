<!-- <script lang="ts">
	import { page } from '$app/stores';
	import type { LayoutData } from './$types';
	import Main from '$lib/components/main';
	import SubNav from '$lib/components/sub-nav/index.svelte';
	import SubNavLink from '$lib/components/sub-nav/sub-nav-link.svelte';
	import { OpenGraphMeta } from '$lib/components/OpenGraphMeta';
	import { useUser } from '$lib/features/auth/core/user';
	import { useHasRole } from '$lib/modules/permissions/hooks';
	import { m } from '$lib/paraglide/messages';
	import { me } from '../../queries/me.remote';
	import { userLayoutDataByIdentifier } from './queries/user-layout-data-by-identifier.remote';

	interface Props {
		data: LayoutData;
		children: import('svelte').Snippet;
	}

	let { data, children, params }: Props = $props();

	const loggedInUser = $derived(await me());
	const user = $derived((await userLayoutDataByIdentifier(params.identifier)).user);

	const isOwnPage = $derived(loggedInUser?.id === user.id);
	const allResultsCount = $derived(
		user.calendarEventResultsCount + user.tournamentResultsCount // xxx: do in the remote func
	);
	const isResultsPage = $derived($page.url.pathname.includes('results'));

	const metaTitle = data.user.username;
	const metaDescription = `${data.user.username}'s profile on sendou.ink including builds, tournament results, art and more.`;
</script>

{#snippet template()}
	<OpenGraphMeta title={user.username} description={metaDescription} />

	<Main bigger={isResultsPage}>
		<SubNav>
			<SubNavLink href={userPage(data.user)} data-testid="user-profile-tab">
				{m.common_header_profile()}
			</SubNavLink>
			<SubNavLink to={userSeasonsPage({ user: data.user })} data-testid="user-seasons-tab">
				{m.user_seasons()}
			</SubNavLink>
			{#if isOwnPage}
				<SubNavLink
					to={userEditProfilePage(data.user)}
					prefetch="intent"
					data-testid="user-edit-tab"
				>
					{m.common_actions_edit()}
				</SubNavLink>
			{/if}
			{#if allResultsCount > 0}
				<SubNavLink to={userResultsPage(data.user)} data-testid="user-results-tab">
					{m.common_results()} ({allResultsCount})
				</SubNavLink>
			{/if}
			{#if data.user.buildsCount > 0 || isOwnPage}
				<SubNavLink to={userBuildsPage(data.user)} prefetch="intent" data-testid="user-builds-tab">
					{m.common_pages_builds()} ({data.user.buildsCount})
				</SubNavLink>
			{/if}
			{#if data.user.vodsCount > 0 || isOwnPage}
				<SubNavLink to={userVodsPage(data.user)} data-testid="user-vods-tab">
					{m.common_pages_vods()} ({data.user.vodsCount})
				</SubNavLink>
			{/if}
			{#if data.user.artCount > 0 || isOwnPage}
				<SubNavLink to={userArtPage(data.user)} end={false} data-testid="user-art-tab">
					{m.common_pages_art()} ({data.user.artCount})
				</SubNavLink>
			{/if}
			{#if user?.roles.includes('STAFF')}
				<SubNavLink to={userAdminPage(data.user)} data-testid="user-admin-tab">Admin</SubNavLink>
			{/if}
		</SubNav>
		{@render children()}
	</Main>
{/snippet}

{@render template()} -->

wip
