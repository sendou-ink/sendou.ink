<script lang="ts">
import { Calendar, ChevronRight, PanelLeft, Tv, Users } from "@lucide/svelte";
import type { Snippet } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import Image from "#lib/components/Image.svelte";
import NotificationDot from "#lib/components/NotificationDot.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { getPatrons } from "#lib/features/front-page/front-page.remote.ts";
import { getNotifications } from "#lib/features/notifications/notifications.remote.ts";
import { UnseenNotificationsDot } from "#lib/features/notifications/notifications-state.svelte.ts";
import { toNotificationRows } from "#lib/features/notifications/notifications-utils.ts";
import { setSidenavCollapsed } from "#lib/features/sidenav/sidenav.remote.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { GIT_COMMIT } from "#lib/utils/git-commit.ts";
import { IsMounted } from "#lib/utils/is-mounted.svelte.ts";
import { EVENTS_PAGE, FRIENDS_PAGE } from "#lib/utils/urls.ts";
import { afterNavigate } from "$app/navigation";
import { page } from "$app/state";
import Footer from "./Footer.svelte";
import FriendMenu from "./FriendMenu.svelte";
import ListLink from "./ListLink.svelte";
import type { Breadcrumb, NotificationRow } from "./layout-types.ts";
import MobileNav from "./MobileNav.svelte";
import SideNav from "./SideNav.svelte";
import SideNavFooter from "./SideNavFooter.svelte";
import SideNavHeader from "./SideNavHeader.svelte";
import SideNavUserPanel from "./SideNavUserPanel.svelte";
import StreamListItems from "./StreamListItems.svelte";
import TopNavMenus from "./TopNavMenus.svelte";
import TopRightButtons from "./TopRightButtons.svelte";

const MAX_DESKTOP_FRIENDS = 4;

interface Props {
	children: Snippet;
}

let { children }: Props = $props();

const user = $derived(loggedInUser());
const sidebarData = $derived(page.data.sidebar);
const initialCollapsed = page.data.sidenavCollapsed ?? false;

// svelte-ignore state_referenced_locally -- the cookie value seeds the initial state only
let sideNavCollapsed = $state(initialCollapsed);
let sideNavModalOpen = $state(false);
const mounted = new IsMounted();

// the bell data streams lazily like the React app's NotificationsProvider:
// after hydration, never blocking SSR; the live query keeps every tab fresh
const notificationsQuery = $derived(
	mounted.current && user ? getNotifications() : null,
);
const notifications = $derived<NotificationRow[] | null>(
	notificationsQuery?.current?.notifications
		? toNotificationRows(notificationsQuery.current.notifications)
		: null,
);

const unseenIds = $derived(
	notifications
		?.filter((notification) => !notification.seen)
		.map((notification) => notification.id) ?? [],
);
const unseenDot = new UnseenNotificationsDot(
	() => notificationsQuery?.current?.notifications,
);
const showUnseenDot = $derived(unseenDot.show);

const patrons = $derived(await getPatrons());

const events = $derived(sidebarData?.events ?? []);
const friends = $derived(sidebarData?.friends ?? []);
const streams = $derived(sidebarData?.streams ?? []);
const unseenFriendRequests = $derived(
	sidebarData?.incomingFriendRequestIds.length ?? 0,
);

const isFrontPage = $derived(page.url.pathname === "/");

// xxx: wire to the chat sidebar when the chat rebuild lands (svelte-big-bang
// phase 3); until then the button renders for layout parity with the React app
const noopUntilChatRebuild = () => {};

const breadcrumbs = $derived(page.data.breadcrumbs ?? []);
const currentPageText = $derived(breadcrumbs.at(-1)?.text);

function unseenRequestsLabel(count: number) {
	return count === 1
		? m.friends_unseenRequests_one({ count })
		: m.friends_unseenRequests_other({ count });
}

const sideNavCollapseForm = setSidenavCollapsed.enhance(async ({ submit }) => {
	sideNavCollapsed = !sideNavCollapsed;
	try {
		await submit().updates();
	} catch {
		// losing the preference cookie is fine, the optimistic state stays
	}
});

// mobile hide-on-scroll header, ported from the React useNavOffset
const NAV_HEIGHT_FALLBACK = 55;
const SCROLL_THRESHOLD_PX = 200;

const isMobile = new MediaQuery("width < 600px");

let headerElement = $state<HTMLElement | null>(null);
let navOffset = $state(0);
let lastScrollY = 0;
let scrollAccumulator = 0;

$effect(() => {
	if (!isMobile.current) {
		navOffset = 0;
	}
});

function handleScroll() {
	if (!isMobile.current) {
		navOffset = 0;
		lastScrollY = window.scrollY;
		scrollAccumulator = 0;
		return;
	}

	const navHeight = headerElement?.offsetHeight ?? NAV_HEIGHT_FALLBACK;
	const currentScrollY = window.scrollY;
	const scrollDelta = currentScrollY - lastScrollY;

	const directionChanged =
		(scrollDelta > 0 && scrollAccumulator < 0) ||
		(scrollDelta < 0 && scrollAccumulator > 0);

	if (directionChanged) {
		scrollAccumulator = 0;
	}

	scrollAccumulator += scrollDelta;

	if (Math.abs(scrollAccumulator) >= SCROLL_THRESHOLD_PX) {
		const overflow =
			scrollAccumulator > 0
				? scrollAccumulator - SCROLL_THRESHOLD_PX
				: scrollAccumulator + SCROLL_THRESHOLD_PX;

		navOffset = Math.max(-navHeight, Math.min(0, navOffset - overflow));

		scrollAccumulator =
			scrollAccumulator > 0 ? SCROLL_THRESHOLD_PX : -SCROLL_THRESHOLD_PX;
	}

	lastScrollY = currentScrollY;
}

// the tablet-only sidenav modal closes on navigation
afterNavigate(() => {
	sideNavModalOpen = false;
});

function showModal(dialog: HTMLDialogElement) {
	dialog.showModal();
}

function formatRelativeDate(timestamp: number) {
	const locale = getLocale();
	const date = new Date(timestamp * 1000);
	const timeFormatter = new Intl.DateTimeFormat(locale, {
		hour: "numeric",
		minute: "numeric",
	});
	const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	});

	const now = new Date();
	const isToday = date.toDateString() === now.toDateString();
	const tomorrow = new Date(now);
	tomorrow.setDate(now.getDate() + 1);
	const isTomorrow = date.toDateString() === tomorrow.toDateString();

	const formatRelativeDay = (daysFromToday: number) => {
		const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
		const str = rtf.format(daysFromToday, "day");
		return str.charAt(0).toUpperCase() + str.slice(1);
	};

	if (isToday) return `${formatRelativeDay(0)}, ${timeFormatter.format(date)}`;
	if (isTomorrow) {
		return `${formatRelativeDay(1)}, ${timeFormatter.format(date)}`;
	}

	return dateTimeFormatter.format(date);
}
</script>

<svelte:window onscroll={handleScroll} />

{#snippet siteLogoContent()}
	<span class="siteLogoS">S</span>
	<span class="siteLogoInk">ink</span>
{/snippet}

{#snippet siteTitle()}
	<div class="siteTitle">
		<a href="/" class="siteLogo">
			{@render siteLogoContent()}
		</a>
		{#each breadcrumbs as crumb (crumb.href)}
			<span class="separator">/</span>
			{#if page.url.pathname === crumb.href}
				{@render pageIcon(crumb)}
			{:else}
				<a href={crumb.href} class="breadcrumbLink">
					{@render pageIcon(crumb)}
				</a>
			{/if}
		{/each}
		{#if currentPageText}
			<span class="pageName">{currentPageText}</span>
		{/if}
	</div>
{/snippet}

{#snippet pageIcon(crumb: Breadcrumb)}
	{#if crumb.type === "IMAGE" && crumb.imgPath}
		<div class="pageIconWrapper">
			<Image
				path={crumb.imgPath}
				alt=""
				class="pageIcon rounded"
				width={20}
				height={20}
			/>
		</div>
	{/if}
{/snippet}

{#snippet sideNavFooterContent()}
	<SideNavFooter>
		<SideNavUserPanel {notifications} {unseenIds} {showUnseenDot} />
	</SideNavFooter>
{/snippet}

{#snippet sideNavChildren()}
	<SideNavHeader>
		{#snippet icon()}<Calendar />{/snippet}
		{#snippet action()}
			{#if user}
				<a href={EVENTS_PAGE} class="viewAllLink">
					{m.common_actions_viewAll()}
					<ChevronRight size={14} />
				</a>
			{/if}
		{/snippet}
		{m.front_sideNav_myCalendar()}
	</SideNavHeader>
	{#each events as event (`${event.type}-${event.id}`)}
		<ListLink
			to={event.url}
			imageUrl={event.logoUrl ?? undefined}
			user={event.user ?? undefined}
		>
			{#snippet subtitle()}
				{#if mounted.current}
					{formatRelativeDate(event.startsAt)}
				{:else}
					<span class="invisible">Placeholder</span>
				{/if}
			{/snippet}
			{event.scrimStatus === "booked"
				? m.front_sideNav_scrimVs({ opponent: event.name })
				: event.scrimStatus === "looking"
					? m.front_sideNav_lookingForScrim()
					: event.scrimStatus === "requestPending"
						? m.front_sideNav_scrimRequestPending()
						: event.name}
		</ListLink>
	{:else}
		<div data-testid="side-nav-empty" class="sideNavEmpty">
			{m.front_sideNav_noEvents()}
		</div>
	{/each}

	<SideNavHeader>
		{#snippet icon()}<Users />{/snippet}
		{#snippet action()}
			{#if user}
				{#if unseenFriendRequests > 0}
					<span
						class="friendRequestsBadge"
						role="status"
						aria-label={unseenRequestsLabel(unseenFriendRequests)}
					>
						{unseenFriendRequests}
					</span>
				{/if}
				<a href={FRIENDS_PAGE} class="viewAllLink">
					{m.common_actions_viewAll()}
					<ChevronRight size={14} />
				</a>
			{/if}
		{/snippet}
		{m.front_sideNav_friends()}
	</SideNavHeader>
	{#each friends.slice(0, MAX_DESKTOP_FRIENDS) as friend (friend.id)}
		<FriendMenu {...friend} />
	{:else}
		<div data-testid="side-nav-empty" class="sideNavEmpty">
			{user
				? m.front_sideNav_friends_noFriends()
				: m.front_sideNav_friends_notLoggedIn()}
		</div>
	{/each}

	<SideNavHeader>
		{#snippet icon()}<Tv />{/snippet}
		{m.front_sideNav_streams()}
	</SideNavHeader>
	{#if streams.length === 0}
		<div data-testid="side-nav-empty" class="sideNavEmpty">
			{m.front_sideNav_noStreams()}
		</div>
	{/if}
	<StreamListItems
		{streams}
		isLoggedIn={Boolean(user)}
		savedTournamentIds={sidebarData?.savedTournamentIds}
	/>
{/snippet}

<SideNav
	collapsed={sideNavCollapsed}
	topCentered={isFrontPage}
>
	{#snippet top()}{@render siteTitle()}{/snippet}
	{#snippet footer()}{@render sideNavFooterContent()}{/snippet}
	{@render sideNavChildren()}
</SideNav>
<MobileNav
	{sidebarData}
	notifications={notifications ?? undefined}
	unseenNotificationIds={unseenIds}
	{showUnseenDot}
/>
<div class="container">
	<header
		bind:this={headerElement}
		class="header"
		style="transform: translateY({navOffset}px)"
	>
		<a href="/" class="siteLogo mobileLogo">
			{@render siteLogoContent()}
		</a>
		<div class="sideNavCollapseButtonContainer" data-testid="sidenav-modal-trigger">
			<button
				type="button"
				class="collapseButton sideNavModalTrigger"
				onclick={() => {
					sideNavModalOpen = !sideNavModalOpen;
				}}
			>
				<PanelLeft />
			</button>
			{#if !sideNavModalOpen && showUnseenDot}
				<NotificationDot />
			{/if}
			{#if !sideNavModalOpen && unseenFriendRequests > 0}
				<span
					class={[
						"sideNavCollapseBadge",
						{ sideNavCollapseBadgeLeft: showUnseenDot },
					]}
					role="status"
					aria-label={unseenRequestsLabel(unseenFriendRequests)}
				>
					{unseenFriendRequests}
				</span>
			{/if}
		</div>
		<div
			class="sideNavCollapseButtonContainer"
			data-testid="sidenav-collapse-button"
		>
			<form class="sideNavCollapseForm" {...sideNavCollapseForm}>
				<input
					{...setSidenavCollapsed.fields.collapsed.as(
						"hidden",
						!sideNavCollapsed,
					)}
				/>
				<button class="collapseButton sideNavCollapseButton">
					<PanelLeft />
				</button>
			</form>
			{#if sideNavCollapsed && showUnseenDot}
				<NotificationDot />
			{/if}
			{#if sideNavCollapsed && unseenFriendRequests > 0}
				<span
					class={[
						"sideNavCollapseBadge",
						{ sideNavCollapseBadgeLeft: showUnseenDot },
					]}
					role="status"
					aria-label={unseenRequestsLabel(unseenFriendRequests)}
				>
					{unseenFriendRequests}
				</span>
			{/if}
		</div>
		<TopNavMenus />
		<TopRightButtons
			showSupport={Boolean(!user?.roles.includes("MINOR_SUPPORT"))}
			showSearch={Boolean(user)}
			isLoggedIn={Boolean(user)}
			onChatToggle={user ? noopUntilChatRebuild : undefined}
			onChatModalToggle={user ? noopUntilChatRebuild : undefined}
			chatUnreadCount={0}
		/>
		<div id="nprogress-anchor" aria-hidden="true"></div>
	</header>
	{@render children()}
	<Footer {patrons} gitCommit={GIT_COMMIT} />
</div>

{#if sideNavModalOpen}
	<dialog
		class="sideNavModal"
		closedby="any"
		onclose={() => {
			sideNavModalOpen = false;
		}}
		{@attach showModal}
	>
		<SideNav class="sideNavInModal" topCentered={isFrontPage}>
			{#snippet top()}{@render siteTitle()}{/snippet}
			{#snippet footer()}{@render sideNavFooterContent()}{/snippet}
			{@render sideNavChildren()}
		</SideNav>
	</dialog>
{/if}

<style>
	.container {
		flex: 1;
		min-width: 0;
	}

	.header {
		container-type: inline-size;
		display: flex;
		width: 100%;
		height: var(--layout-nav-height);
		align-items: center;
		gap: var(--s-2);
		border-bottom: 1.5px solid var(--color-border);
		background-color: var(--color-bg-nav);
		font-weight: var(--weight-extra);
		padding-inline: var(--s-4);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.siteTitle {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		height: 100%;
		min-width: 0;
		padding: 3px;
		margin: -3px;
	}

	.siteLogo {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 36px;
		background-color: var(--color-text-accent);
		border-radius: var(--radius-field);
		font-weight: var(--weight-bold);
		color: var(--color-text-inverse);
		text-decoration: none;
		flex-shrink: 0;
		transition: background-color 0.2s;
		line-height: 1;

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}
	}

	.siteLogoS {
		font-size: 14px;
		position: relative;
		top: -4px;
	}

	.siteLogoInk {
		font-size: 12px;
		position: relative;
		bottom: -4px;
	}

	.separator {
		font-size: var(--font-xs);
		color: var(--color-text-high);
		font-weight: var(--weight-bold);
		opacity: 0.5;
		animation: fadeIn 200ms ease-out 150ms both;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.5;
		}
	}

	.pageIconWrapper {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		animation: fadeInFull 200ms ease-out 150ms both;
	}

	.pageIconWrapper :global(.pageIcon) {
		width: 28px;
		height: 28px;
		object-fit: cover;
	}

	@keyframes fadeInFull {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.breadcrumbLink {
		display: flex;
		align-items: center;
		text-decoration: none;
		border-radius: var(--radius-field);

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}
	}

	.pageName {
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		animation: fadeInFull 200ms ease-out 150ms both;
	}

	@media screen and (display-mode: standalone) {
		.header {
			align-items: flex-end;
			padding-top: calc(var(--s-2) + env(safe-area-inset-top));
			padding-bottom: var(--s-2);
			height: calc(var(--layout-nav-height) + env(safe-area-inset-top));
		}

		.sideNavModal {
			top: calc(var(--layout-nav-height) + env(safe-area-inset-top));
			height: calc(100dvh - var(--layout-nav-height) - env(safe-area-inset-top));

			&::backdrop {
				top: calc(var(--layout-nav-height) + env(safe-area-inset-top));
			}
		}
	}

	:global(.sideNavEmpty) {
		font-size: var(--font-2xs);
		color: var(--color-text-high);
		padding: var(--s-1) var(--s-2);
		margin: 0 auto;
		font-style: italic;
	}

	:global(.viewAllLink) {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	:global(.viewAllLink svg) {
		stroke-width: 3;
	}

	:global(.friendRequestsBadge) {
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
		margin-inline-end: var(--s-1-5);
		pointer-events: none;
	}

	.sideNavCollapseBadge {
		position: absolute;
		top: -5px;
		inset-inline-end: -5px;
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		color: var(--color-text-inverse);
		background-color: var(--color-text-accent);
		min-width: 16px;
		height: 16px;
		padding: 0 var(--s-0-5);
		border-radius: 8px;
		display: grid;
		place-items: center;
		line-height: 1;
		pointer-events: none;

		&.sideNavCollapseBadgeLeft {
			inset-inline-end: auto;
			inset-inline-start: -5px;
		}
	}

	.sideNavCollapseButtonContainer {
		display: none;
		position: relative;
		--dot-top: 2px;
		--dot-right: 2px;

		&:has(.sideNavCollapseButton) {
			@media screen and (min-width: 1000px) {
				display: flex;
			}
		}

		&:has(.sideNavModalTrigger) {
			@media screen and (min-width: 600px) and (max-width: 999px) {
				display: flex;
			}
		}
	}

	.sideNavCollapseForm {
		display: contents;
	}

	.collapseButton {
		display: none;
		align-items: center;
		justify-content: center;
		appearance: none;
		border: none;
		background-color: transparent;
		border-radius: var(--radius-field);
		cursor: pointer;
		padding: 0;
		height: var(--field-size-sm);
		aspect-ratio: 1 / 1;

		&:focus-visible {
			outline: var(--focus-ring);
		}

		& :global(svg) {
			color: var(--color-text);
			min-width: 20px;
			max-width: 20px;
		}

		&.sideNavCollapseButton {
			@media screen and (min-width: 1000px) {
				display: flex;
			}
		}

		&.sideNavModalTrigger {
			@media screen and (min-width: 600px) and (max-width: 999px) {
				display: flex;
			}
		}
	}

	.sideNavModal {
		position: fixed;
		inset: var(--layout-nav-height) auto 0 0;
		margin: 0;
		border: none;
		padding: 0;
		height: calc(100dvh - var(--layout-nav-height));
		max-height: none;
		width: var(--layout-sidenav-width);
		max-width: none;
		background: transparent;
		border-right: 1.5px solid var(--color-border);

		&::backdrop {
			top: var(--layout-nav-height);
			background-color: rgba(0, 0, 0, 0.4);
			backdrop-filter: blur(4px);
		}
	}

	.sideNavModal :global(.sideNavInModal) {
		display: flex;
		position: static;
		height: 100%;
		min-width: unset;
		max-width: unset;
		border-right: none;
	}

	.mobileLogo {
		display: flex;

		@media screen and (min-width: 600px) {
			display: none;
		}
	}
</style>
