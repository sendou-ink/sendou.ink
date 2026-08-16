<script lang="ts">
import { Heart, Menu, Share2, Tv, X } from "@lucide/svelte";
import Image from "#lib/components/Image.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { canAccessTrophies } from "#lib/features/trophies/trophies-utils.ts";
import { dynamicMessage } from "#lib/modules/i18n/messages.ts";
import { m } from "#lib/paraglide/messages.js";
import {
	navIconUrl,
	SENDOU_INK_BASE_URL,
	SUPPORT_PAGE,
} from "#lib/utils/urls.ts";
import { browser } from "$app/env";
import { page } from "$app/state";
import GhostTabBar from "./GhostTabBar.svelte";
import type { SidebarStream } from "./layout-types.ts";
import { navItems } from "./nav-items.ts";
import StreamListItems from "./StreamListItems.svelte";

interface Props {
	streams: SidebarStream[];
	savedTournamentIds?: number[];
	onClose: () => void;
	ghostTabCount: number;
	onGhostTabPress: (index: number) => void;
	skipAnimation: boolean;
}

let {
	streams,
	savedTournamentIds,
	onClose,
	ghostTabCount,
	onGhostTabPress,
	skipAnimation,
}: Props = $props();

const user = $derived(loggedInUser());

const visibleNavItems = $derived(
	navItems.filter(
		(item) => item.name !== "trophies" || canAccessTrophies(user),
	),
);

function pageLabel(name: string) {
	return dynamicMessage(`common_pages_${name.replaceAll("-", "_")}`);
}

function share() {
	if (browser && typeof navigator.share === "function") {
		void navigator.share({
			url: `${SENDOU_INK_BASE_URL}${page.url.pathname}${page.url.search}`,
		});
	}
}

function showModal(dialog: HTMLDialogElement) {
	dialog.showModal();
}
</script>

<dialog
	class={["menuOverlay", "scrollbar", { noAnimation: skipAnimation }]}
	closedby="any"
	onclose={onClose}
	{@attach showModal}
>
	<div data-testid="mobile-nav-panel" class="panelDialog">
			<header class="menuHeader">
				<div class="panelIconContainer">
					<Menu size={18} />
				</div>
				<h2 class="panelTitle">{m.front_mobileNav_menu()}</h2>
				<div class="menuHeaderActions">
					{#if !user?.roles.includes("MINOR_SUPPORT")}
						<a href={SUPPORT_PAGE} class="supportLinkButton">
							<span class="supportLinkIcon"><Heart /></span>
							{m.common_pages_support()}
						</a>
					{/if}
					<button
						type="button"
						class="shareButton"
						aria-label={m.common_actions_share()}
						onclick={share}
					>
						<Share2 />
					</button>
					<button
						type="button"
						data-testid="panel-close-button"
						class="panelCloseButton"
						onclick={onClose}
					>
						<X size={18} />
					</button>
				</div>
			</header>

			<nav aria-label={m.front_mobileNav_menu()}>
				<ul class="navGrid">
					{#each visibleNavItems as item (item.name)}
						<li>
							<a href="/{item.url}" class="navItem" onclick={onClose}>
								<div class="navItemImage">
									<Image
										path={navIconUrl(item.name)}
										height={32}
										width={32}
										alt=""
									/>
								</div>
								<span>{pageLabel(item.name)}</span>
							</a>
						</li>
					{/each}
				</ul>
			</nav>

			<section>
				<header class="menuHeader">
					<div class="panelIconContainer">
						<Tv size={18} />
					</div>
					<h3 class="panelTitle">{m.front_sideNav_streams()}</h3>
				</header>
				{#if streams.length === 0}
					<div data-testid="side-nav-empty" class="sideNavEmpty">
						{m.front_sideNav_noStreams()}
					</div>
				{/if}
				<ul class="streamsList">
					<StreamListItems
						{streams}
						onclick={onClose}
						isLoggedIn={Boolean(user)}
						{savedTournamentIds}
					/>
				</ul>
			</section>
			<GhostTabBar tabCount={ghostTabCount} onTabPress={onGhostTabPress} />
	</div>
</dialog>

<style>
	.menuOverlay {
		position: fixed;
		inset: 0 0 var(--layout-nav-height) 0;
		margin: 0;
		border: none;
		padding: 0;
		width: 100%;
		max-width: none;
		height: calc(100dvh - var(--layout-nav-height));
		max-height: none;
		background-color: var(--color-bg);
		color: inherit;
		overflow-y: auto;

		&[open] {
			display: flex;
			flex-direction: column;
			animation: fade-in 200ms ease-out;
		}

		&::backdrop {
			bottom: var(--layout-nav-height);
			background-color: rgba(0, 0, 0, 0.25);
			backdrop-filter: blur(10px);
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.noAnimation[open] {
		animation: none;
	}

	.panelDialog {
		outline: none;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.menuHeader {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding-inline: var(--s-4);
		background-color: var(--color-bg-high);
		border-bottom: 1.5px solid var(--color-border);
		border-top: 1.5px solid var(--color-border);
		flex-shrink: 0;
		color: var(--color-text-high);
		min-height: var(--layout-nav-height);

		.panelDialog > &:first-child {
			border-top: none;
			padding-block-start: env(safe-area-inset-top);
		}
	}

	.menuHeaderActions {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		margin-inline-start: auto;
	}

	.panelTitle {
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);
	}

	.panelIconContainer {
		border-radius: var(--radius-field);
	}

	.panelCloseButton {
		display: grid;
		place-items: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-error);
		padding: 0;
		height: var(--field-size);
		aspect-ratio: 1 / 1;
		border-radius: var(--radius-field);
		margin-inline-start: auto;

		&:hover {
			background-color: var(--color-bg-higher);
		}
	}

	.supportLinkButton {
		display: flex;
		align-items: center;
		justify-content: center;
		border: var(--border-style-accent);
		border-radius: var(--radius-field);
		background-color: transparent;
		color: var(--color-text-accent);
		cursor: pointer;
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);
		padding: 0 var(--field-padding);
		height: var(--field-size-sm);
		white-space: nowrap;
		text-decoration: none;
	}

	.supportLinkIcon {
		display: inline-flex;
		min-width: 18px;
		max-width: 18px;
		margin-inline-end: var(--s-1);

		& :global(svg) {
			width: 100%;
			height: auto;
		}
	}

	.shareButton {
		display: grid;
		place-items: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-accent);
		padding: 0;
		width: var(--field-size-sm);
		height: var(--field-size-sm);
		border-radius: 50%;

		& :global(svg) {
			width: 18px;
			height: 18px;
		}
	}

	.sideNavEmpty {
		padding: var(--s-4);
		text-align: center;
		color: var(--color-text-high);
		font-size: var(--font-xs);
	}

	.streamsList {
		list-style: none;
		margin: 0;
		padding: var(--s-4);
		padding-block-end: calc(env(safe-area-inset-bottom) + var(--s-4));

		& :global(a:not(:first-child)) {
			padding-block: var(--s-2);
		}

		& :global(a:first-child) {
			padding-block-start: 0;
		}
	}

	.navGrid {
		list-style: none;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--s-3);
		padding: var(--s-4);
	}

	.navItem {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-1);
		text-decoration: none;
		color: var(--color-text);
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		text-align: center;

		&:hover {
			color: var(--color-text-accent);
		}
	}

	.navItemImage {
		width: var(--field-size-lg);
		aspect-ratio: 1 / 1;
		border-radius: var(--radius-field);
		background-color: var(--color-bg-higher);
		display: grid;
		place-items: center;
	}
</style>
