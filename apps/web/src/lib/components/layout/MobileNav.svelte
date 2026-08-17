<script lang="ts">
import {
	Calendar,
	ChevronRight,
	LogIn,
	Menu,
	MessageSquare,
	Settings,
	User,
	Users,
} from "@lucide/svelte";
import { MediaQuery } from "svelte/reactivity";
import Avatar from "#lib/components/Avatar.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import ChatSidebar from "#lib/features/chat/components/ChatSidebar.svelte";
import NotificationContent from "#lib/features/notifications/components/NotificationContent.svelte";
import { markNotificationsSeen } from "#lib/features/notifications/notifications.remote.ts";
import { m } from "#lib/paraglide/messages.js";
import {
	EVENTS_PAGE,
	FRIENDS_PAGE,
	SETTINGS_PAGE,
	userPage,
} from "#lib/utils/urls.ts";
import EventsList from "./EventsList.svelte";
import FriendMenu from "./FriendMenu.svelte";
import LogInButtonContainer from "./LogInButtonContainer.svelte";
import type { NotificationRow, SidebarData } from "./layout-types.ts";
import MobileNavMenuOverlay from "./MobileNavMenuOverlay.svelte";
import MobilePanel from "./MobilePanel.svelte";
import MobileTab from "./MobileTab.svelte";

type PanelType = "closed" | "menu" | "friends" | "tourneys" | "chat" | "you";

const SENDOUQ_ACTIVITY_LABEL = "SendouQ";

interface Props {
	sidebarData: SidebarData | undefined;
	notifications?: NotificationRow[];
	unseenNotificationIds?: number[];
	showUnseenDot?: boolean;
}

let {
	sidebarData,
	notifications,
	unseenNotificationIds,
	showUnseenDot = false,
}: Props = $props();

let activePanel = $state<PanelType>("closed");
let previousPanel = $state<PanelType>("closed");

// xxx: no 600px hard coded many places, one centralized helper
// the panels are modal dialogs; leaving them open past the mobile breakpoint
// would keep the rest of the page inert while the tab bar is display: none
const isDesktop = new MediaQuery("width >= 600px");

$effect(() => {
	if (isDesktop.current && activePanel !== "closed") {
		closePanel();
	}
});

const user = $derived(loggedInUser());

const hasFriendInSendouQ = $derived(
	sidebarData?.friends.some((f) => f.subtitle === SENDOUQ_ACTIVITY_LABEL) ??
		false,
);
const unseenFriendRequests = $derived(
	sidebarData?.incomingFriendRequestIds.length ?? 0,
);

const skipAnimation = $derived(previousPanel !== "closed");

const loggedInTabs: PanelType[] = [
	"menu",
	"friends",
	"tourneys",
	"chat",
	"you",
];
const loggedOutTabs: PanelType[] = ["menu"];
const ghostTabs = $derived(user ? loggedInTabs : loggedOutTabs);

function closePanel() {
	previousPanel = activePanel;
	activePanel = "closed";
}

function handleTabPress(panel: PanelType) {
	previousPanel = activePanel;
	activePanel = activePanel === panel ? "closed" : panel;

	// opening the "you" panel shows the notification list, which marks its
	// notifications seen; the live query streams the updated rows back
	if (
		activePanel === "you" &&
		unseenNotificationIds &&
		unseenNotificationIds.length > 0
	) {
		markNotificationsSeen({ notificationIds: unseenNotificationIds }).catch(
			() => {
				// dropping the seen-marking is fine, the dot just stays
			},
		);
	}
}

function handleGhostTabPress(index: number) {
	const panel = ghostTabs[index];
	if (panel) handleTabPress(panel);
}
</script>

<div class="mobileNav">
	{#if activePanel === "menu"}
		<MobileNavMenuOverlay
			streams={sidebarData?.streams ?? []}
			savedTournamentIds={sidebarData?.savedTournamentIds}
			onClose={closePanel}
			ghostTabCount={ghostTabs.length}
			onGhostTabPress={handleGhostTabPress}
			{skipAnimation}
		/>
	{/if}

	{#if activePanel === "friends"}
		<MobilePanel
			title={m.front_sideNav_friends()}
			onClose={closePanel}
			ghostTabCount={ghostTabs.length}
			onGhostTabPress={handleGhostTabPress}
			{skipAnimation}
		>
			{#snippet icon()}<Users size={18} />{/snippet}
			{#if (sidebarData?.friends.length ?? 0) > 0}
				{#each sidebarData?.friends ?? [] as friend (friend.id)}
					<FriendMenu {...friend} onNavigate={closePanel} />
				{/each}
			{:else}
				<div data-testid="side-nav-empty" class="sideNavEmpty">
					{user
						? m.front_sideNav_friends_noFriends()
						: m.front_sideNav_friends_notLoggedIn()}
				</div>
			{/if}
			<a href={FRIENDS_PAGE} class="panelSectionLink" onclick={closePanel}>
				{m.common_actions_viewAll()}
				<ChevronRight size={14} />
			</a>
		</MobilePanel>
	{/if}

	{#if activePanel === "tourneys"}
		<MobilePanel
			title={m.front_sideNav_myCalendar()}
			onClose={closePanel}
			ghostTabCount={ghostTabs.length}
			onGhostTabPress={handleGhostTabPress}
			{skipAnimation}
		>
			{#snippet icon()}<Calendar size={18} />{/snippet}
			<EventsList events={sidebarData?.events ?? []} onclick={closePanel} />
			<a href={EVENTS_PAGE} class="panelSectionLink" onclick={closePanel}>
				{m.common_actions_viewAll()}
				<ChevronRight size={14} />
			</a>
		</MobilePanel>
	{/if}

	{#if activePanel === "chat" && user}
		<MobilePanel
			title={m.front_mobileNav_chat()}
			onClose={closePanel}
			ghostTabCount={ghostTabs.length}
			onGhostTabPress={handleGhostTabPress}
			{skipAnimation}
		>
			{#snippet icon()}<MessageSquare size={18} />{/snippet}
			<div class="chatPanelBody">
				<ChatSidebar />
			</div>
		</MobilePanel>
	{/if}

	{#if activePanel === "you" && user}
		<MobilePanel
			title={m.front_mobileNav_you()}
			onClose={closePanel}
			ghostTabCount={ghostTabs.length}
			onGhostTabPress={handleGhostTabPress}
			{skipAnimation}
		>
			{#snippet icon()}<User size={18} />{/snippet}
			<div class="youPanelUserRow">
				<a href={userPage(user)} class="youPanelUser" onclick={closePanel}>
					<Avatar {user} size="sm" />
					<span data-testid="you-panel-username" class="youPanelUsername">
						{user.username}
					</span>
				</a>
				<a
					href={SETTINGS_PAGE}
					class="youPanelSettingsButton"
					onclick={closePanel}
					aria-label={m.common_pages_settings()}
				>
					<Settings size={18} />
				</a>
			</div>

			{#if notifications}
				<NotificationContent
					{notifications}
					unseenIds={unseenNotificationIds ?? []}
					onClose={closePanel}
				/>
			{/if}
		</MobilePanel>
	{/if}

	<nav class="tabBar">
		<MobileTab
			label={m.front_mobileNav_menu()}
			isActive={activePanel === "menu"}
			onPress={() => handleTabPress("menu")}
		>
			{#snippet icon()}<Menu />{/snippet}
		</MobileTab>

		{#if user}
			<MobileTab
				label={m.front_mobileNav_friends()}
				isActive={activePanel === "friends"}
				onPress={() => handleTabPress("friends")}
				showNotificationDot={hasFriendInSendouQ}
				badgeCount={unseenFriendRequests}
				badgeLeft={hasFriendInSendouQ}
			>
				{#snippet icon()}<Users />{/snippet}
			</MobileTab>
			<MobileTab
				label={m.front_sideNav_myCalendar()}
				isActive={activePanel === "tourneys"}
				onPress={() => handleTabPress("tourneys")}
			>
				{#snippet icon()}<Calendar />{/snippet}
			</MobileTab>
			<MobileTab
				label={m.front_mobileNav_chat()}
				isActive={activePanel === "chat"}
				onPress={() => handleTabPress("chat")}
			>
				{#snippet icon()}<MessageSquare />{/snippet}
			</MobileTab>
			<MobileTab
				label={m.front_mobileNav_you()}
				isActive={activePanel === "you"}
				onPress={() => handleTabPress("you")}
				showNotificationDot={showUnseenDot}
			>
				{#snippet icon()}<User />{/snippet}
			</MobileTab>
		{:else}
			<LogInButtonContainer>
				<button type="submit" class="tab">
					<span class="tabIcon">
						<LogIn />
					</span>
					<span>{m.front_mobileNav_login()}</span>
				</button>
			</LogInButtonContainer>
		{/if}
	</nav>
</div>

<style>
	.mobileNav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 19;
	}

	@media screen and (min-width: 600px) {
		.mobileNav {
			display: none;
		}
	}

	.tabBar {
		display: flex;
		justify-content: space-around;
		align-items: center;
		height: calc(var(--layout-nav-height) + env(safe-area-inset-bottom));
		background-color: var(--color-bg-nav);
		border-top: 1.5px solid var(--color-border);
		padding: 0 var(--s-4);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0;
		height: 100%;
		aspect-ratio: 1 / 1;
		background: none;
		border: none;
		border-radius: var(--radius-field);
		color: var(--color-text-high);
		font-size: var(--font-2xs);
		font-weight: var(--weight-semi);
		cursor: pointer;
		text-decoration: none;
		transition: color 0.15s;

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: -1px;
		}

		&:hover {
			color: var(--color-text-accent);
		}
	}

	.tabIcon {
		position: relative;
		width: 24px;
		height: 24px;

		& :global(svg) {
			width: 24px;
			height: 24px;
		}
	}

	.sideNavEmpty {
		padding: var(--s-4);
		text-align: center;
		color: var(--color-text-high);
		font-size: var(--font-xs);
	}

	.youPanelUserRow {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		padding: var(--s-1) var(--s-2);
	}

	.youPanelUser {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2);
		text-decoration: none;
		color: var(--color-text);
		border-radius: var(--radius-field);

		&:hover {
			background-color: var(--color-bg-high);
		}
	}

	.youPanelUsername {
		font-size: var(--font-md);
		font-weight: var(--weight-bold);
	}

	.youPanelSettingsButton {
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		color: var(--color-text-high);
		border-radius: var(--radius-field);
		height: var(--field-size);
		aspect-ratio: 1 / 1;

		&:hover {
			background-color: var(--color-bg-high);
			color: var(--color-text);
		}

		& :global(svg) {
			width: 18px;
			height: 18px;
		}
	}

	.panelSectionLink {
		display: flex;
		align-items: center;
		gap: 2px;
		width: fit-content;
		margin-top: auto;
		margin-inline: auto;
		margin-bottom: var(--s-4);
		font-size: var(--font-2xs);
		color: var(--color-text-high);
		text-decoration: none;
		height: var(--selector-size);
		padding: 0 var(--s-3);
		background-color: var(--color-bg-high);
		border-radius: var(--radius-selector);

		& :global(svg) {
			stroke-width: 3;
		}

		&:hover {
			color: var(--color-text);
			background-color: var(--color-bg-higher);
		}
	}

	.chatPanelBody {
		height: min(65dvh, 520px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
</style>
