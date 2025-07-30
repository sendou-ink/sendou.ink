<script lang="ts">
	import Avatar from '$lib/components/avatar.svelte';
	import Flag from '$lib/components/flag.svelte';
	import TeamInfo from './team-info.svelte';
	import { userLayoutData } from './user-layout-data.remote';
	import { userProfile } from './user-profile.remote';
	import Socials from './socials.svelte';
	import ExtraInfos from './extra-infos.svelte';
	import WeaponPool from './weapon-pool.svelte';
	import TopPlacements from './top-placements.svelte';

	let { params } = $props();

	const user = $derived((await userLayoutData(params.identifier)).user);
	const profile = $derived(await userProfile(params.identifier));

	const hasExtraInfos = $derived(
		profile.inGameName ||
			typeof profile.stickSens === 'number' ||
			profile.discordUniqueName ||
			profile.plusTier
	);
</script>

<div class="container">
	<div class="avatar-container">
		<Avatar {user} size="lg" class="avatar" />
		<div>
			<h2 class="name">
				<div>{user.username}</div>
				<div>
					{#if profile.country}
						<Flag countryCode={profile.country} tiny />
					{/if}
				</div>
			</h2>

			{#if profile.team}
				<TeamInfo />
			{/if}
		</div>

		<Socials {profile} />
	</div>

	{#if hasExtraInfos}
		<ExtraInfos {profile} userId={user.id} />
	{/if}

	{#if profile.weapons.length > 0}
		<WeaponPool weapons={profile.weapons} />
	{/if}

	{#if profile.topPlacements.length > 0}
		<TopPlacements placements={profile.topPlacements} />
	{/if}

	<!-- xxx: add BadgeDisplay -->
	<!-- <BadgeDisplay badges={data.user.badges} key={data.user.id} /> -->

	{#if profile.bio}
		<article>{profile.bio}</article>
	{/if}
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		gap: var(--s-6);

		:global(.avatar) {
			min-width: 125px;
			grid-area: avatar;
		}
	}

	.avatar-container {
		display: grid;
		justify-content: center;
		column-gap: var(--s-2-5);
		grid-template-areas: 'avatar name' 'avatar team' 'avatar .' 'avatar .' 'socials .';
	}

	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		grid-area: name;
		overflow-wrap: anywhere;
		gap: var(--s-2-5);
	}
</style>
