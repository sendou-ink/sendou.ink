<script lang="ts">
	import DiscordIcon from "$lib/components/icons/discord.svelte";
	import YouTubeIcon from "$lib/components/icons/youtube.svelte";
	import Main from "$lib/components/main.svelte";
	import links from "./links.json";

	// links should be sorted in the json like so: links.sort((a, b) => a.title.localeCompare(b.title))
</script>

<Main>
	<div class="stack md container">
		{#each links as link (link.url)}
			<div>
				<h2 class="text-sm">
					<a
						href={link.url}
						target="_blank"
						rel="noopener noreferrer"
						class="stack sm horizontal items-center"
					>
						{link.title}
						{#if link.url.includes("discord")}
							<DiscordIcon class="discord-icon" />
						{:else if link.url.includes("youtube")}
							<YouTubeIcon class="youtube-icon" />
						{/if}
					</a>
				</h2>
				<div class="text-sm text-lighter">{link.description}</div>
			</div>
		{/each}
	</div>
</Main>

<style>
	.container :global(.discord-icon) {
		width: 1rem;
		display: inline;
		fill: #7289da;
	}

	.container :global(.youtube-icon) {
		width: 1rem;
		display: inline;
		fill: #f00;
	}
</style>
