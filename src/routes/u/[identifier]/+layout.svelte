<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import Main from '$lib/components/layout/Main.svelte';
	import SideNavItem from '$lib/components/layout/SideNavItem.svelte';
	import SideNavHeader from '$lib/components/layout/SideNavHeader.svelte';
	import SubSideNav from '$lib/components/layout/SubSideNav.svelte';
	import SubSideNavLink from '$lib/components/layout/SubSideNavLink.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { m } from '$lib/paraglide/messages';
	import { resolve } from '$app/paths';
	import { discordAvatarUrl } from '$lib/utils/urls';
	import type { Snippet } from 'svelte';
	import * as UserAPI from '$lib/api/user';
	import Flag from '$lib/components/Flag.svelte';
	import { countryCodeToTranslatedName } from '$lib/utils/i18n';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as AuthAPI from '$lib/api/auth';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Edit from '@lucide/svelte/icons/edit';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Zap from '@lucide/svelte/icons/zap';
	import Video from '@lucide/svelte/icons/video';
	import Palette from '@lucide/svelte/icons/palette';
	import Shield from '@lucide/svelte/icons/shield';

	interface Props extends PageProps {
		children: Snippet;
	}

	let { children, params }: Props = $props();

	// xxx: await_waterfall
	// tracked: https://github.com/sveltejs/svelte/issues/16483
	const loggedInUser = await AuthAPI.queries.me();
	const { user, seasonsParticipatedIn } = $derived(
		await UserAPI.queries.layoutDataByIdentifier(params.identifier)
	);

	const isOwnPage = $derived(loggedInUser?.id === user.id);
	const isResultsPage = $derived(page.url.pathname.includes('results'));
	const isBuildsPage = $derived(page.url.pathname.includes('builds'));

	const countryName = $derived(
		user.country
			? countryCodeToTranslatedName({
					countryCode: user.country,
					language: getLocale()
				})
			: null
	);
	const countryNameWithRegion = $derived(
		user.country === 'US' && user.region ? `${user.region}, ${countryName}` : countryName
	);
</script>

<OpenGraphMeta
	title={user.username}
	description={`${user.username}'s profile on sendou.ink including builds, tournament results, art and more.`}
/>

<Main bigger={isResultsPage || isBuildsPage}>
	{#snippet sideNavHeading()}
		<SideNavHeader
			href={resolve(`/u/${params.identifier}`)}
			imgSrc={discordAvatarUrl(user)}
			heading={user.username}
		>
			{#snippet subheading()}
				{#if countryNameWithRegion}
					<div class="stack horizontal xs items-center">
						<Flag countryCode={user.country!} tiny />
						{countryNameWithRegion}
					</div>
				{/if}
			{/snippet}</SideNavHeader
		>
	{/snippet}
	{#snippet sideNav()}
		{#if isOwnPage}
			<SideNavItem href={resolve(`/u/${params.identifier}/edit`)} data-testid="user-edit-tab">
				{#snippet icon()}
					<Edit />
				{/snippet}
				{m.common_actions_edit()}
			</SideNavItem>
		{/if}
		{#if user.resultsCount > 0}
			<SideNavItem
				href={resolve(`/u/${params.identifier}/results`)}
				data-testid="user-results-tab"
				number={user.resultsCount}
			>
				{#snippet icon()}
					<Trophy />
				{/snippet}
				{m.common_results()}
			</SideNavItem>
		{/if}
		{#if user.buildsCount > 0 || isOwnPage}
			<SideNavItem
				href={resolve(`/u/${params.identifier}/builds`)}
				data-testid="user-builds-tab"
				number={user.buildsCount}
			>
				{#snippet icon()}
					<Zap />
				{/snippet}
				{m.common_pages_builds()}
			</SideNavItem>
		{/if}
		{#if user.vodsCount > 0 || isOwnPage}
			<SideNavItem
				href={resolve(`/u/${params.identifier}/vods`)}
				data-testid="user-vods-tab"
				number={user.vodsCount}
			>
				{#snippet icon()}
					<Video />
				{/snippet}
				{m.common_pages_vods()}
			</SideNavItem>
		{/if}
		{#if user.artCount > 0 || isOwnPage}
			<SideNavItem
				href={resolve(`/u/${params.identifier}/art`)}
				data-testid="user-art-tab"
				number={user.artCount}
			>
				{#snippet icon()}
					<Palette />
				{/snippet}
				{m.common_pages_art()}
			</SideNavItem>
		{/if}
		{#if loggedInUser?.roles.includes('STAFF')}
			<SideNavItem href={resolve(`/u/${params.identifier}/admin`)} data-testid="user-admin-tab">
				{#snippet icon()}
					<Shield />
				{/snippet}
				Admin
			</SideNavItem>
		{/if}
		{#if seasonsParticipatedIn.length > 0}
			<SideNavItem data-testid="user-seasons-tab">
				{#snippet icon()}
					<Calendar />
				{/snippet}
				{m.user_seasons()}
			</SideNavItem>
			<SubSideNav>
				{#each seasonsParticipatedIn as seasonNth (seasonNth)}
					<SubSideNavLink href={resolve(`/u/${params.identifier}/seasons/${seasonNth}`)}>
						{m.front_sq_season({ nth: seasonNth })}
					</SubSideNavLink>
				{/each}
			</SubSideNav>
		{/if}
	{/snippet}
	{@render children()}
</Main>
