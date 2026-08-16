<script lang="ts">
	import { Heart, LogIn, MessageSquare, Search } from "@lucide/svelte";
	import { Button } from "@sendou/components";
	import { browser } from "$app/env";
	import { m } from "#lib/paraglide/messages.js";
	import { SUPPORT_PAGE } from "#lib/utils/urls.ts";
	import AnythingAdder from "./AnythingAdder.svelte";
	import LogInButtonContainer from "./LogInButtonContainer.svelte";

	interface Props {
		showSupport: boolean;
		showSearch: boolean;
		isLoggedIn: boolean;
		onChatToggle?: () => void;
		onChatModalToggle?: () => void;
		chatUnreadCount?: number;
	}

	let {
		showSupport,
		showSearch,
		isLoggedIn,
		onChatToggle,
		onChatModalToggle,
		chatUnreadCount,
	}: Props = $props();

	const isMac = $derived(
		browser && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
	);
</script>

<div class="container">
	{#if showSupport}
		<div class="supportWrapper">
			<a href={SUPPORT_PAGE} class="supportLinkButton">
				<span class="supportLinkIcon"><Heart /></span>
				{m.common_pages_support()}
			</a>
		</div>
		<div class="supportWrapperCompact">
			<a href={SUPPORT_PAGE} class="supportLinkButton square" aria-label={m.common_pages_support()}>
				<span class="supportLinkIcon lonely"><Heart /></span>
			</a>
		</div>
	{/if}
	{#if isLoggedIn}
		<div class="searchAndAddContainer">
			{#if showSearch}
				<div class="searchWrapper">
					<!-- TODO(later slice): open the global search dialog once the search feature migrates -->
					<button type="button" class="searchButton">
						<Search class="searchIcon" />
						<span class="searchPlaceholder">{m.common_search()}</span>
						<kbd class="searchKbd">{isMac ? "Cmd+K" : "Ctrl+K"}</kbd>
					</button>
				</div>
			{/if}
			<div class="addNewWrapper">
				<AnythingAdder />
			</div>
			<div class="addNewWrapperCompact">
				<AnythingAdder compact />
			</div>
		</div>
		{#if onChatToggle}
			<div class="chatButtonWrapperPersistent">
				<Button
					shape="square"
					size="small"
					variant="outlined"
					onclick={onChatToggle}
				>
					{#snippet icon()}<MessageSquare />{/snippet}
				</Button>
				{#if chatUnreadCount}
					<span class="chatUnreadBadge">{chatUnreadCount}</span>
				{/if}
			</div>
		{/if}
		{#if onChatModalToggle}
			<div class="chatButtonWrapperModal">
				<Button
					shape="square"
					size="small"
					variant="outlined"
					onclick={onChatModalToggle}
				>
					{#snippet icon()}<MessageSquare />{/snippet}
				</Button>
				{#if chatUnreadCount}
					<span class="chatUnreadBadge">{chatUnreadCount}</span>
				{/if}
			</div>
		{/if}
	{:else}
		<LogInButtonContainer>
			<Button type="submit" size="small">
				{#snippet icon()}<LogIn />{/snippet}
				{m.front_mobileNav_login()}
			</Button>
		</LogInButtonContainer>
	{/if}
</div>

<style>
	.container {
		display: flex;
		gap: var(--s-4);
		margin-left: auto;
	}

	.supportWrapper {
		@media screen and (max-width: 599px) {
			display: none;
		}
	}

	.supportWrapperCompact {
		display: none;
	}

	.addNewWrapperCompact {
		display: none;
	}

	@media screen and (min-width: 600px) {
		@container (max-width: 600px) {
			.supportWrapper {
				display: none;
			}

			.supportWrapperCompact {
				display: block;
			}
		}

		@container (max-width: 475px) {
			.addNewWrapper {
				display: none;
			}

			.addNewWrapperCompact {
				display: block;
			}

			.searchAndAddContainer {
				grid-template-columns: 2fr 1fr;
			}
		}
	}

	.searchAndAddContainer {
		display: grid;
		grid-template-columns: 2fr max-content;
		gap: var(--s-2);
	}

	.searchWrapper > button,
	.addNewWrapper > :global(button) {
		width: 100%;
	}

	.supportLinkButton {
		display: flex;
		width: auto;
		align-items: center;
		justify-content: center;
		border: var(--border-style-accent);
		border-radius: var(--radius-field);
		appearance: none;
		background-color: transparent;
		color: var(--color-text-accent);
		cursor: pointer;
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);
		padding: 0 var(--field-padding);
		user-select: none;
		outline-color: var(--color-text-accent);
		height: var(--field-size-sm);
		white-space: nowrap;
		text-decoration: none;

		&:focus-visible {
			outline-style: solid;
			outline-width: 2px;
			outline-offset: 1px;
		}

		&:active {
			transform: translateY(1px);
		}

		&.square {
			aspect-ratio: 1 / 1;
			padding: 0;
		}
	}

	.supportLinkIcon {
		display: inline-flex;
		min-width: 18px;
		max-width: 18px;
		margin-inline-end: var(--s-1);

		&.lonely {
			margin-inline-end: 0;
		}

		& :global(svg) {
			width: 100%;
			height: auto;
		}
	}

	.searchButton {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: 0 var(--s-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-field);
		background-color: var(--color-bg);
		color: var(--color-text-high);
		font-size: var(--font-xs);
		cursor: pointer;
		height: var(--field-size-sm);
		transition: background-color 0.15s;

		&:hover {
			background-color: var(--color-bg-high);
		}

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}
	}

	.searchButton :global(.searchIcon) {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.searchPlaceholder {
		flex-grow: 1;
		text-align: left;
	}

	.searchKbd {
		padding: 2px var(--s-1);
		border-radius: var(--radius-field);
		font-size: var(--font-2xs);
		background-color: var(--color-bg-higher);
		font-family: inherit;
	}

	.chatButtonWrapperPersistent {
		display: none;
		position: relative;

		@media screen and (min-width: 1000px) {
			display: block;
		}

		& > :global(button) {
			width: 100%;
		}
	}

	.chatButtonWrapperModal {
		display: none;
		position: relative;

		@media screen and (min-width: 600px) and (max-width: 999px) {
			display: block;
		}

		& > :global(button) {
			width: 100%;
		}
	}

	.chatUnreadBadge {
		position: absolute;
		top: -6px;
		right: -6px;
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		color: var(--color-text-inverse);
		background-color: var(--color-text-accent);
		min-width: 18px;
		height: 18px;
		padding: 0 var(--s-1);
		border-radius: 9px;
		display: grid;
		place-items: center;
		pointer-events: none;
	}

	@media screen and (max-width: 1000px) {
		.searchAndAddContainer {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
