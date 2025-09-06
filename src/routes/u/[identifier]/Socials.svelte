<script lang="ts">
	import TwitchIcon from '$lib/components/icons/Twitch.svelte';
	import YouTubeIcon from '$lib/components/icons/YouTube.svelte';
	import BattlefyIcon from '$lib/components/icons/Battlefy.svelte';
	import BskyIcon from '$lib/components/icons/Bsky.svelte';
	import type { ProfileByIdentifierData } from '$lib/api/user/queries.remote';

	interface Props {
		profile: Pick<ProfileByIdentifierData, 'twitch' | 'youtubeId' | 'battlefy' | 'bsky'>;
	}

	let { profile }: Props = $props();
</script>

<div class="socials">
	{#if profile.twitch}
		<a class="social-link twitch" href={`https://www.twitch.tv/${profile.twitch}`}>
			<TwitchIcon />
		</a>
	{/if}
	{#if profile.youtubeId}
		<a class="social-link youtube" href={`https://www.youtube.com/channel/${profile.youtubeId}`}>
			<YouTubeIcon />
		</a>
	{/if}
	{#if profile.battlefy}
		<a class="social-link battlefy" href={`https://battlefy.com/users/${profile.battlefy}`}>
			<BattlefyIcon />
		</a>
	{/if}
	{#if profile.bsky}
		<a class="social-link bsky" href={`https://bsky.app/profile/${profile.bsky}`}>
			<BskyIcon />
		</a>
	{/if}
</div>

<style>
	.socials {
		display: flex;
		justify-content: center;
		gap: var(--s-1-5);
		grid-area: socials;
		padding-block-start: var(--s-2-5);
	}

	.social-link {
		padding: var(--s-1);
		border: 1px solid;
		border-radius: 50%;

		&.youtube {
			border-color: #f00;
			background-color: #ff00002f;

			:global(svg) {
				fill: #f00;
			}
		}

		&.twitch {
			border-color: #9146ff;
			background-color: #9146ff2f;

			:global(svg) {
				fill: #9146ff;
			}
		}

		&.battlefy {
			border-color: #de4c5e;
			background-color: #de4c5e2f;

			:global(svg) {
				fill: #de4c5e;
			}
		}

		&.bsky {
			border-color: #1285fe;
			background-color: #1285fe2f;
			display: grid;
			place-items: center;

			:global(path) {
				fill: #1285fe;
			}
		}

		:global(svg) {
			width: 0.9rem;
		}
	}
</style>
