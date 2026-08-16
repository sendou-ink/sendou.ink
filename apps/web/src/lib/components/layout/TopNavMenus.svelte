<script lang="ts" module>
import { Config } from "#lib/config.ts";

const NAV_CATEGORIES = [
	{
		name: "play",
		items: [
			{ name: "sendouq", url: "q" },
			{ name: "scrims", url: "scrims" },
			{ name: "lfg", url: "lfg" },
			{ name: "calendar", url: "calendar" },
			{ name: "leaderboards", url: "leaderboards" },
			...(Config.showLutiNavItem ? [{ name: "luti", url: "luti" }] : []),
		],
	},
	{
		name: "tools",
		items: [
			{ name: "analyzer", url: "analyzer" },
			{ name: "comp-analyzer", url: "comp-analyzer" },
			{ name: "object-damage-calculator", url: "object-damage-calculator" },
			{ name: "plans", url: "plans" },
			{ name: "maps", url: "maps" },
			{ name: "tier-list-maker", url: "tier-list-maker" },
			{ name: "xsearch", url: "xsearch" },
			{ name: "admin", url: "admin", icon: "settings", staffOnly: true },
		],
	},
	{
		name: "community",
		items: [
			{ name: "builds", url: "builds" },
			{ name: "art", url: "art" },
			{ name: "articles", url: "a" },
			{ name: "vods", url: "vods" },
			{ name: "trophies", url: "trophies" },
			{ name: "links", url: "links" },
			{ name: "plus", url: "plus/suggestions" },
		],
	},
] as const;

interface NavCategoryItem {
	name: string;
	url: string;
	icon?: string;
	staffOnly?: boolean;
}
</script>

<script lang="ts">
	import { closePopoverOnScrollClip } from "@sendou/components";
	import { page } from "$app/state";
	import { dev } from "$app/env";
	import { hasRole, loggedInUser } from "#lib/features/auth/user-state.ts";
	import { canAccessTrophies } from "#lib/features/trophies/trophies-utils.ts";
	import { dynamicMessage } from "#lib/modules/i18n/messages.ts";
	import { m } from "#lib/paraglide/messages.js";
	import { ADMIN_ID } from "#lib/features/admin/admin-constants.ts";
	import {
		impersonateUrl,
		navIconUrl,
		STOP_IMPERSONATING_URL,
	} from "#lib/utils/urls.ts";
	import Image from "#lib/components/Image.svelte";

	const NZAP_TEST_ID = 2;

	const DEV_IMPERSONATE_ITEMS = [
		{ name: "Sendou", icon: "sendou_love", action: impersonateUrl(ADMIN_ID) },
		{ name: "N-ZAP", icon: "u", action: impersonateUrl(NZAP_TEST_ID) },
		{ name: "Logged out", icon: "log_in", action: STOP_IMPERSONATING_URL },
	] as const;

	const showStaffOnly = $derived(hasRole("STAFF") || dev);
	const user = $derived(loggedInUser());

	function categoryLabel(name: string) {
		return dynamicMessage(`front_nav_${name}`);
	}

	function pageLabel(name: string) {
		return dynamicMessage(`common_pages_${name.replaceAll("-", "_")}`);
	}

	function visibleItems(items: readonly NavCategoryItem[]) {
		return items.filter((item) => {
			if (item.staffOnly && !showStaffOnly) return false;
			if (item.name === "trophies" && !canAccessTrophies(user)) return false;
			return true;
		});
	}

	let openCategory = $state<string | null>(null);
	let openMenuElement = $state<HTMLElement | null>(null);
	const returnTo = $derived(`${page.url.pathname}${page.url.search}`);

	const uid = $props.id();

	closePopoverOnScrollClip({
		isOpen: () => openCategory !== null,
		element: () => openMenuElement,
		close: () => openMenuElement?.hidePopover(),
	});

	function menuId(name: string) {
		return `${uid}-nav-menu-${name}`;
	}

	function anchorName(name: string) {
		return `--top-nav-anchor-${uid}-${name}`;
	}

	function onMenuToggle(event: Event, name: string) {
		const isOpen = (event as ToggleEvent).newState === "open";
		if (isOpen) {
			openCategory = name;
			openMenuElement = event.currentTarget as HTMLElement;
		} else if (openCategory === name) {
			openCategory = null;
			openMenuElement = null;
		}
	}

	function closeContainingPopover(event: Event) {
		(event.currentTarget as HTMLElement)
			.closest<HTMLElement>("[popover]")
			?.hidePopover();
	}
</script>

<nav class="container">
	{#each NAV_CATEGORIES as category (category.name)}
		<div class="menuWrapper">
			<button
				type="button"
				class="menuButton"
				popovertarget={menuId(category.name)}
				aria-expanded={openCategory === category.name}
				style:anchor-name={anchorName(category.name)}
			>
				{categoryLabel(category.name)}
			</button>
			<div
				id={menuId(category.name)}
				popover="auto"
				class="menuPopover"
				style:position-anchor={anchorName(category.name)}
				ontoggle={(event) => onMenuToggle(event, category.name)}
			>
				<div data-testid="menu-content" class="menuContent">
					{#each visibleItems(category.items) as item (item.url)}
						<a
							href="/{item.url}"
							class="menuItem"
							onclick={closeContainingPopover}
						>
							<Image
								path={navIconUrl(item.icon ?? item.name)}
								alt=""
								size={20}
								class="menuItemIcon"
							/>
							{pageLabel(item.name)}
						</a>
					{/each}
				</div>
			</div>
			{#if openCategory !== category.name}
				<div class="preview">
					{#each visibleItems(category.items) as item (item.url)}
						<a
							href="/{item.url}"
							class="previewIcon"
							title={pageLabel(item.name)}
							aria-label={pageLabel(item.name)}
							tabindex={-1}
						>
							<Image
								path={navIconUrl(item.icon ?? item.name)}
								alt=""
								size={20}
							/>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
	{#if dev}
		<div class="menuWrapper">
			<button
				type="button"
				class="menuButton"
				popovertarget={menuId("dev")}
				aria-expanded={openCategory === "dev"}
				style:anchor-name={anchorName("dev")}
			>
				Dev
			</button>
			<div
				id={menuId("dev")}
				popover="auto"
				class="menuPopover"
				style:position-anchor={anchorName("dev")}
				ontoggle={(event) => onMenuToggle(event, "dev")}
			>
				<div data-testid="menu-content" class="menuContent">
					{#each DEV_IMPERSONATE_ITEMS as item (item.name)}
						<form class="menuItemForm" method="post" action={item.action}>
							<input type="hidden" name="returnTo" value={returnTo} />
							<button type="submit" class="menuItem menuItemButton">
								<Image
									path={navIconUrl(item.icon)}
									alt=""
									size={20}
									class="menuItemIcon"
								/>
								{item.name}
							</button>
						</form>
					{/each}
				</div>
			</div>
			{#if openCategory !== "dev"}
				<div class="preview">
					{#each DEV_IMPERSONATE_ITEMS as item (item.name)}
						<form class="menuItemForm" method="post" action={item.action}>
							<input type="hidden" name="returnTo" value={returnTo} />
							<button
								type="submit"
								class="previewIcon previewIconButton"
								title={item.name}
								aria-label={item.name}
								tabindex={-1}
							>
								<Image path={navIconUrl(item.icon)} alt="" size={20} />
							</button>
						</form>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</nav>

<style>
	.container {
		display: none;
		align-items: center;

		@media screen and (min-width: 600px) {
			display: flex;
		}
	}

	.menuWrapper {
		position: relative;
	}

	.menuButton {
		display: flex;
		align-items: center;
		padding: 0 var(--s-2);
		height: var(--field-size-sm);
		border: none;
		border-radius: var(--radius-field);
		background: transparent;
		color: var(--color-text);
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		cursor: pointer;
		white-space: nowrap;

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}
	}

	.menuPopover {
		position: fixed;
		position-area: block-end span-inline-end;
		position-try-fallbacks: flip-inline;
		margin: var(--s-1) 0 0;
		max-width: min(20rem, calc(100vw - var(--s-4)));
		padding: var(--s-2);
		border: var(--border-style);
		border-radius: var(--radius-box);
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
		background-color: var(--color-bg-high);
		color: var(--color-text);
	}

	.menuContent {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--s-0-5);
	}

	.menuItem {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-1-5) var(--s-2);
		border-radius: var(--radius-field);
		color: var(--color-text);
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		text-decoration: none;
		transition:
			background-color 0.15s,
			color 0.15s;
		white-space: nowrap;

		&:hover,
		&:focus-visible {
			background-color: var(--color-bg-higher);
		}
	}

	.menuItemForm {
		display: contents;
	}

	.menuItemButton {
		width: 100%;
		border: none;
		background: transparent;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.menuItem :global(.menuItemIcon) {
		flex-shrink: 0;
	}

	.preview {
		position: absolute;
		top: calc(100% + var(--s-1));
		left: 0;
		z-index: 1;
		display: none;
		width: max-content;
		grid-auto-flow: column;
		grid-template-rows: repeat(2, auto);
		gap: var(--s-1);
		padding: var(--s-1) var(--s-1-5);
		border: var(--border-style);
		border-radius: var(--radius-field);
		background-color: var(--color-bg-high);

		.menuWrapper:hover & {
			display: grid;
		}

		&::before {
			content: "";
			position: absolute;
			top: calc(-1 * (var(--s-1) + var(--border-width)));
			left: 0;
			right: 0;
			height: calc(var(--s-1) + var(--border-width));
		}
	}

	.previewIcon {
		display: flex;
		flex-shrink: 0;
		padding: var(--s-1);
		border-radius: var(--radius-full);
		transition: background-color 0.15s;

		&:hover {
			background-color: var(--color-bg-higher);
		}
	}

	.previewIconButton {
		border: none;
		background: transparent;
		cursor: pointer;
	}
</style>
