<script lang="ts">
import Image from "#lib/components/Image.svelte";
import DiscordIcon from "#lib/components/icons/DiscordIcon.svelte";
import GitHubIcon from "#lib/components/icons/GitHubIcon.svelte";
import PatreonIcon from "#lib/components/icons/PatreonIcon.svelte";
import { m } from "#lib/paraglide/messages.js";
import {
	API_PAGE,
	CONTRIBUTIONS_PAGE,
	FAQ_PAGE,
	NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL,
	SENDOU_INK_DISCORD_URL,
	SENDOU_INK_GITHUB_URL,
	SENDOU_LOVE_EMOJI_PATH,
	SUPPORT_PAGE,
	userPage,
	WELCOME_PAGE,
} from "#lib/utils/urls.ts";

interface Patron {
	id: number;
	username: string;
	discordId: string;
	customUrl?: string | null;
}

interface Props {
	patrons?: Patron[];
	gitCommit?: string | null;
}

let { patrons, gitCommit }: Props = $props();

const currentYear = new Date().getFullYear();
</script>

<footer class="footer">
	<div class="linkList">
		<a href={CONTRIBUTIONS_PAGE}>{m.common_pages_contributors()}</a>
		<a href={FAQ_PAGE}>{m.common_pages_faq()}</a>
		<a href={WELCOME_PAGE}>{m.common_pages_welcome()}</a>
		<a href={API_PAGE}>{m.common_pages_api()}</a>
	</div>
	<div class="socials">
		<a
			class="socialLink"
			href={SENDOU_INK_GITHUB_URL}
			target="_blank"
			rel="noreferrer"
		>
			<div class="socialHeader">
				GitHub<p>{m.common_footer_github_subtitle()}</p>
			</div>
			<GitHubIcon class="socialIcon" />
		</a>
		<a
			class="socialLink"
			href={SENDOU_INK_DISCORD_URL}
			target="_blank"
			rel="noreferrer"
		>
			<div class="socialHeader">
				Discord<p>{m.common_footer_discord_subtitle()}</p>
			</div>
			<DiscordIcon class="socialIcon" />
		</a>
		<a class="socialLink" href={SUPPORT_PAGE}>
			<div class="socialHeader">
				Patreon<p>{m.common_footer_patreon_subtitle()}</p>
			</div>
			<PatreonIcon class="socialIcon" />
		</a>
	</div>
	<div>
		<h4 class="patronTitle">
			{m.common_footer_thanks()}
			<Image alt="" path={SENDOU_LOVE_EMOJI_PATH} width={24} height={24} />
		</h4>
		<ul class="patronList">
			{#each patrons ?? [] as patron (patron.id)}
				<li>
					<a href={userPage(patron)} class="patron">
						{patron.username}
					</a>
				</li>
			{/each}
		</ul>
	</div>
	<div class="copyrightNote">
		<p>
			sendou.ink © Copyright of Sendou and contributors 2019-{currentYear}.
			Original content & source code is licensed under the AGPL-3.0 license.
		</p>
		<p>
			Splatoon is trademark & © of Nintendo 2014-{currentYear}. sendou.ink is
			not affiliated with Nintendo.
		</p>
		<p>
			All tournaments hosted on sendou.ink are unofficial and are not sponsored
			by or affiliated with Nintendo. Terms for participating in and viewing
			Community Tournaments using Nintendo Games can be found here:
			<a
				href={NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL}
				target="_blank"
				rel="noreferrer"
			>
				{NINTENDO_COMMUNITY_TOURNAMENTS_GUIDELINES_URL}
			</a>
		</p>
	</div>
	{#if gitCommit}
		<a
			class="sourceLink"
			href="{SENDOU_INK_GITHUB_URL}/commits/{gitCommit}/"
			target="_blank"
			rel="noreferrer"
		>
			{m.common_footer_version()}
			{gitCommit.slice(0, 10)}
		</a>
	{/if}
</footer>

<style>
	.footer {
		display: flex;
		flex-direction: column;
		padding: var(--s-3);
		background-color: var(--color-bg-high);
		gap: var(--s-6);
		margin-block-start: auto;
		padding-block-end: var(--s-32);
	}

	.linkList {
		display: flex;
		justify-content: space-evenly;
		font-size: var(--font-2xs);

		& > * {
			flex: 1;
			text-align: center;
		}
	}

	.socials {
		display: flex;
		justify-content: center;
		gap: var(--s-2);
	}

	.footer :global(.socialIcon) {
		height: 2.25rem;
		transition: transform 0.25s ease-in-out;
	}

	.socialLink {
		display: flex;
		max-width: 10rem;
		height: 12rem;
		flex: 1 1 0;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		padding: var(--s-4);
		border-radius: var(--radius-box);
		background-color: var(--color-bg-higher);
		cursor: pointer;
		font-size: var(--font-lg);
	}

	.socialLink:hover > :global(.socialIcon) {
		transform: translateY(-0.3rem);
	}

	.socialHeader {
		text-align: center;

		& > p {
			font-size: var(--font-2xs);
		}
	}

	.patronTitle {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
		gap: var(--s-2);
	}

	.patronList {
		display: flex;
		max-width: 75vw;
		flex-wrap: wrap;
		justify-content: center;
		padding: 0;
		margin: 0 auto;
		font-size: var(--font-xs);
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

	.copyrightNote {
		display: flex;
		flex-direction: column;
		color: var(--color-text-high);
		font-size: var(--font-2xs);
		text-align: center;
	}

	.sourceLink {
		margin-inline: auto;
		font-size: var(--font-2xs);
		color: var(--color-text-high);
		font-style: italic;
	}

	@media screen and (max-width: 640px) {
		.socials {
			flex-direction: column;
		}

		.socialLink {
			max-width: initial;
			flex-direction: row;
		}

		.socialLink:hover > :global(.socialIcon) {
			transform: translateX(-0.3rem);
		}

		.socialHeader {
			display: flex;
			align-items: center;
			gap: var(--s-2);
			text-align: initial;

			& > p {
				margin-block-start: var(--s-1);
			}
		}

		.footer :global(.socialIcon) {
			height: 1.75rem;
		}
	}
</style>
