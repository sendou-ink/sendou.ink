<script lang="ts">
	import DiscordIcon from '$lib/components/icons/Discord.svelte';
	import GitHubIcon from '$lib/components/icons/GitHub.svelte';
	import PatreonIcon from '$lib/components/icons/Patreon.svelte';
	import { patrons } from '../../../routes/patrons.remote';
	import { m } from '$lib/paraglide/messages';
	import { asset, resolve } from '$app/paths';

	const currentYear = new Date().getFullYear();
</script>

<footer>
	<div class="link-list">
		<a href={resolve('/privacy-policy')}>{m.common_pages_privacy()}</a>
		<a href={resolve('/contributions')}>{m.common_pages_contributors()}</a>
		<a href={resolve('/faq')}>{m.common_pages_faq()}</a>
	</div>
	<div class="socials">
		<a
			class="social-link"
			href="https://github.com/sendou-ink/sendou.ink"
			target="_blank"
			rel="noreferrer"
		>
			<div class="social-header">
				GitHub
				<p>{m.common_footer_github_subtitle()}</p>
			</div>
			<GitHubIcon class="social-icon github" />
		</a>
		<a class="social-link" href="https://discord.gg/sendou" target="_blank" rel="noreferrer">
			<div class="social-header">
				Discord
				<p>{m.common_footer_discord_subtitle()}</p>
			</div>
			<DiscordIcon class="social-icon discord" />
		</a>
		<a class="social-link" href={resolve('/support')}>
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
			<img alt="" src={asset('/img/layout/sendou_love.avif')} width={24} height={24} />
		</h4>
		<ul class="patron-list">
			{#each await patrons() as patron (patron.id)}
				<li>
					<a
						href={resolve('/u/[identifier]', { identifier: patron.customUrl ?? patron.discordId })}
						class="patron"
					>
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
			<a
				href="https://en-americas-support.nintendo.com/app/answers/detail/a_id/63454"
				target="_blank"
				rel="noreferrer"
			>
				https://en-americas-support.nintendo.com/app/answers/detail/a_id/63454
			</a>
		</p>
	</div>
</footer>

<style>
	a {
		font-weight: var(--semi-bold);
		color: var(--color-primary);
	}

	footer {
		display: flex;
		flex-direction: column;
		padding: var(--s-2-5);
		background-color: var(--color-base-section);
		gap: var(--s-6);
		margin-block-start: auto;
		padding-block-end: var(--s-32);
		border-block-start: var(--border-style);
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

		@media screen and (max-width: 640px) {
			flex-direction: column;
		}
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
		border-radius: var(--radius-box);
		background-color: var(--color-primary-transparent);
		cursor: pointer;
		font-size: var(--fonts-lg);

		@media screen and (max-width: 640px) {
			max-width: initial;
			flex-direction: row;
		}
	}

	footer :global(.social-icon) {
		height: 2.25rem;
		transition: transform 0.25s ease-in-out;

		@media screen and (max-width: 640px) {
			height: 1.75rem;
		}
	}

	footer :global(.social-link:hover > .social-icon) {
		transform: translateY(-0.3rem);

		@media screen and (max-width: 640px) {
			transform: translateX(-0.3rem);
		}
	}

	.social-header {
		text-align: center;

		@media screen and (max-width: 640px) {
			display: flex;
			align-items: center;
			gap: var(--s-2);
			text-align: initial;
		}
	}

	.social-header > p {
		font-size: var(--fonts-xxs);

		@media screen and (max-width: 640px) {
			margin-block-start: var(--s-1);
		}
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
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xxs);
		text-align: center;
	}
</style>
