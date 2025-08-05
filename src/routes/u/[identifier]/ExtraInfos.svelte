<script lang="ts">
	import type { UserProfileData } from './user-profile.remote';
	import { navIconUrl } from '$lib/utils/urls';
	import Image from '$lib/components/image/Image.svelte';
	import DiscordIcon from '$lib/components/icons/Discord.svelte';
	import { m } from '$lib/paraglide/messages';
	import { rawSensToString } from '$lib/utils/strings';

	interface Props {
		userId: number;
		profile: Pick<
			UserProfileData,
			'discordUniqueName' | 'inGameName' | 'stickSens' | 'motionSens' | 'plusTier'
		>;
	}

	let { userId, profile }: Props = $props();

	const motionSensText = $derived(
		typeof profile.motionSens === 'number'
			? `${m.user_motion()} ${rawSensToString(profile.motionSens)}`
			: null
	);

	const stickSensText = $derived(
		typeof profile.stickSens === 'number'
			? `${m.user_stick()} ${rawSensToString(profile.stickSens)}`
			: null
	);
</script>

<div class="extra-infos">
	<div class="extra-info">#{userId}</div>
	{#if profile.discordUniqueName}
		<div class="extra-info">
			<span class="heading">
				<DiscordIcon />
			</span>
			{profile.discordUniqueName}
		</div>
	{/if}
	{#if profile.inGameName}
		<div class="extra-info">
			<span class="heading">{m.user_ign_short()}</span>
			{profile.inGameName}
		</div>
	{/if}
	{#if typeof profile.stickSens === 'number'}
		<div class="extra-info">
			<span class="heading">{m.user_sens()}</span>
			{[motionSensText, stickSensText].filter(Boolean).join(' / ')}
		</div>
	{/if}
	{#if profile.plusTier}
		<div class="extra-info">
			<Image path={navIconUrl('plus')} width={20} height={20} alt="" />
			{profile.plusTier}
		</div>
	{/if}
</div>

<style>
	.heading {
		color: var(--color-primary);
		font-weight: var(--bold);

		:global(svg) {
			width: 0.8rem;
		}
	}

	.extra-infos {
		display: flex;
		max-width: 24rem;
		flex-wrap: wrap;
		gap: var(--s-2-5);
		margin-inline: auto;
	}

	.extra-info {
		padding: var(--s-1) var(--s-1-5);
		border-radius: var(--radius-box);
		background-color: var(--color-base-section);
		border: var(--border-style);
		font-size: var(--fonts-xxs);
		display: flex;
		align-items: center;
		gap: var(--s-1);
	}
</style>
