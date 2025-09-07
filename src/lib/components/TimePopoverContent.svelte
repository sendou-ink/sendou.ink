<script lang="ts">
	import { getLocale } from '$lib/paraglide/runtime';
	import CopyToClipboardButton from '$lib/components/CopyToClipboardButton.svelte';
	import { dateToDiscordTimestamp } from '$lib/utils/dates';
	import Discord from '$lib/components/icons/Discord.svelte';

	interface Props {
		date: Date;
	}

	const { date }: Props = $props();
</script>

<div class="stack sm items-center text-xs text-center container">
	{date.toLocaleString(getLocale(), {
		timeZoneName: 'long',
		hour: 'numeric',
		minute: 'numeric'
	})}
	<div class="text-lighter text-xxs stack horizontal xxs">
		<Discord />
		{dateToDiscordTimestamp(date)}
	</div>
	<CopyToClipboardButton content={dateToDiscordTimestamp(date)} />
</div>

<style>
	.container {
		:global {
			svg {
				width: 1rem;
			}
		}
	}
</style>
