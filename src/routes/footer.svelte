<script lang="ts">
	import {
		CONTRIBUTIONS_PAGE,
		FAQ_PAGE,
		NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL,
		PRIVACY_POLICY_PAGE,
		SENDOU_INK_DISCORD_URL,
		SENDOU_INK_GITHUB_URL,
		SENDOU_LOVE_EMOJI_PATH,
		SUPPORT_PAGE,
		userPage
	} from '$lib/utils/urls';
	import Image from '$lib/components/image.svelte';
	import DiscordIcon from '$lib/components/icons/discord.svelte';
	import GitHubIcon from '$lib/components/icons/github.svelte';
	import PatreonIcon from '$lib/components/icons/patreon.svelte';
	import { patrons } from './queries/patrons.remote';
	import { m } from '$lib/paraglide/messages';

	const currentYear = new Date().getFullYear();
</script>

<footer>
	<div class="link-list">
		<a href={PRIVACY_POLICY_PAGE}>{m.common_pages_privacy()}</a>
		<a href={CONTRIBUTIONS_PAGE}>{m.common_pages_contributors()}</a>
		<a href={FAQ_PAGE}>{m.common_pages_faq()}</a>
	</div>
	<div class="socials">
		<a class="social-link" href={SENDOU_INK_GITHUB_URL} target="_blank" rel="noreferrer">
			<div class="social-header">
				GitHub
				<p>{m.common_footer_github_subtitle()}</p>
			</div>
			<GitHubIcon class="social-icon github" />
		</a>
		<a class="social-link" href={SENDOU_INK_DISCORD_URL} target="_blank" rel="noreferrer">
			<div class="social-header">
				Discord
				<p>{m.common_footer_discord_subtitle()}</p>
			</div>
			<DiscordIcon class="social-icon discord" />
		</a>
		<a class="social-link" href={SUPPORT_PAGE}>
			<div class="social-header">
				Patreon
				<p>{m.common_footer_patreon_subtitle()}</p>
			</div>
			<PatreonIcon class="social-icon patreon" />
		</a>
	</div>

	<div>
		<h4 class="patron-title">
			{m.common_footer_thanks()}
			<Image alt="" path={SENDOU_LOVE_EMOJI_PATH} width={24} height={24} />
		</h4>
		<ul class="patron-list">
			{#each await patrons() as patron (patron.id)}
				<li>
					<a href={userPage(patron)} class="patron">
						{patron.username}
					</a>
				</li>
			{/each}
		</ul>
	</div>

	<div class="layout__copyright-note">
		<p>
			sendou.ink © Copyright of Sendou and contributors 2019-{currentYear}. Original content &
			source code is licensed under the AGPL-3.0 license.
		</p>
		<p>
			Splatoon is trademark & © of Nintendo 2014-{currentYear}. sendou.ink is not affiliated with
			Nintendo.
		</p>
		<p>
			Any tournaments hosted on sendou.ink are unofficial and Nintendo is not a sponsor or
			affiliated with them. Terms for participating in and viewing Community Tournaments using
			Nintendo Games can be found here:
			<a href={NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL} target="_blank" rel="noreferrer">
				{NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL}
			</a>
		</p>
	</div>
</footer>

<style>
	footer {
		display: flex;
		flex-direction: column;
		padding: var(--s-2-5);
		background-color: var(--bg-lighter);
		gap: var(--s-6);
		margin-block-start: auto;
		padding-block-end: var(--s-32);
	}

	.link-list {
		display: flex;
		justify-content: space-evenly;
		font-size: var(--fonts-xxs);
	}

	.socials {
		display: flex;
		justify-content: center;
		gap: var(--s-2);
	}

	.social-link {
		display: flex;
		max-width: 10rem;
		height: 12rem;
		flex: 1 1 0;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		padding: var(--s-4);
		border-radius: var(--rounded);
		background-color: var(--theme-transparent);
		cursor: pointer;
		font-size: var(--fonts-lg);
	}

	footer :global(.social-icon) {
		height: 2.25rem;
		transition: transform 0.25s ease-in-out;
	}

	footer :global(.social-link:hover > .social-icon) {
		transform: translateY(-0.3rem);
	}

	.social-header {
		text-align: center;
	}

	.social-header > p {
		font-size: var(--fonts-xxs);
	}

	.patron-title {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);
		gap: var(--s-2);
	}

	.patron-list {
		display: flex;
		max-width: 75vw;
		flex-wrap: wrap;
		justify-content: center;
		padding: 0;
		margin: 0 auto;
		font-size: var(--fonts-xs);
		gap: var(--s-1);
		list-style: none;
		margin-block-start: var(--s-2);
	}

	.patron {
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}

	.layout__copyright-note {
		display: flex;
		flex-direction: column;
		color: var(--text-lighter);
		font-size: var(--fonts-xxs);
		text-align: center;
	}

	@media screen and (max-width: 640px) {
		.socials {
			flex-direction: column;
		}

		.social-link {
			max-width: initial;
			flex-direction: row;
		}

		.social-header {
			display: flex;
			align-items: center;
			gap: var(--s-2);
			text-align: initial;
		}

		.social-header > p {
			margin-block-start: var(--s-1);
		}

		footer :global(.social-icon) {
			height: 1.75rem;
		}

		footer :global(.social-link:hover > .social-icon) {
			transform: translateX(-0.3rem);
		}
	}
</style>
