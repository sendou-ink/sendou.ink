<script lang="ts">
	import { Bell, LogIn, Settings } from "@lucide/svelte";
	import { Popover } from "@sendou/components";
	import { page } from "$app/state";
	import Avatar from "#lib/components/Avatar.svelte";
	import NotificationDot from "#lib/components/NotificationDot.svelte";
	import { loggedInUser } from "#lib/features/auth/user-state.ts";
	import NotificationContent from "#lib/features/notifications/components/NotificationContent.svelte";
	import { m } from "#lib/paraglide/messages.js";
	import { SETTINGS_PAGE, userPage } from "#lib/utils/urls.ts";
	import type { NotificationRow } from "./layout-types.ts";

	interface Props {
		notifications: NotificationRow[] | null;
		unseenIds: number[];
		showUnseenDot: boolean;
	}

	let { notifications, unseenIds, showUnseenDot }: Props = $props();

	const user = $derived(loggedInUser());
</script>

{#if user}
	<a href={userPage(user)} class="sideNavFooterUser">
		<Avatar {user} size="xs" />
		<span class="sideNavFooterUsername">{user.username}</span>
	</a>
	<div class="sideNavFooterActions">
		{#if notifications}
			{#key page.url.pathname}
				<div class="sideNavFooterNotification">
					{#if showUnseenDot}
						<NotificationDot
							class="sideNavFooterUnseenDot"
							testId="notifications-bell-dot"
						/>
					{/if}
					<Popover
						popoverClass={[
							"notificationsPopoverContainer",
							notifications.length === 0
								? "notificationsPopoverEmpty"
								: undefined,
						]
							.filter(Boolean)
							.join(" ")}
					>
						{#snippet trigger(triggerProps)}
							<button
								type="button"
								class="sideNavFooterButton"
								data-testid="notifications-button"
								aria-expanded={triggerProps["aria-expanded"]}
								aria-haspopup={triggerProps["aria-haspopup"]}
								onclick={triggerProps.onclick}
							>
								<Bell />
							</button>
						{/snippet}
						<NotificationContent {notifications} {unseenIds} />
					</Popover>
				</div>
			{/key}
		{/if}
		<a href={SETTINGS_PAGE} class="sideNavFooterButton">
			<Settings />
		</a>
	</div>
{:else}
	<form action="/auth" method="post">
		<button type="submit" class="logInButton">
			<span class="logInIcon"><LogIn /></span>
			{m.common_header_login_discord()}
		</button>
	</form>
	<div class="sideNavFooterActions">
		<a href={SETTINGS_PAGE} class="sideNavFooterButton">
			<Settings />
		</a>
	</div>
{/if}

<style>
	:global(.notificationsPopoverContainer) {
		min-width: 300px;
		padding: 0;
		background-color: var(--color-bg);
	}

	:global(.notificationsPopoverContainer svg) {
		width: 16px;
	}

	:global(.notificationsPopoverEmpty) {
		min-height: 200px;
	}

	.logInButton {
		display: flex;
		width: auto;
		align-items: center;
		justify-content: center;
		border: var(--border-style-accent);
		border-radius: var(--radius-field);
		appearance: none;
		background: var(--color-text-accent);
		color: var(--color-text-inverse);
		cursor: pointer;
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);
		padding: 0 var(--field-padding);
		user-select: none;
		outline-color: var(--color-text-accent);
		height: var(--field-size-sm);
		white-space: nowrap;

		&:focus-visible {
			outline-style: solid;
			outline-width: 2px;
			outline-offset: 1px;
		}

		&:active {
			transform: translateY(1px);
		}
	}

	.logInIcon {
		display: inline-flex;
		min-width: 18px;
		max-width: 18px;
		margin-inline-end: var(--s-1);
	}

	.logInIcon :global(svg) {
		width: 100%;
		height: auto;
	}
</style>
