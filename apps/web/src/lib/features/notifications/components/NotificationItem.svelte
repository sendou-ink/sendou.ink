<script lang="ts">
	import type { NotificationRow } from "#lib/components/layout/layout-types.ts";
	import Image from "#lib/components/Image.svelte";
	import { dynamicMessage } from "#lib/modules/i18n/messages.ts";
	import { databaseTimestampToDate } from "#lib/utils/dates.ts";
	import { formatDistanceToNowLocalized } from "#lib/utils/format-distance.ts";
	import { navIconUrl } from "#lib/utils/urls.ts";

	interface Props {
		notification: NotificationRow;
		unseen: boolean;
		onClose?: () => void;
	}

	let { notification, unseen, onClose }: Props = $props();

	const text = $derived.by(() => {
		let message = dynamicMessage(
			`common_notifications_text_${notification.type}`,
		);
		for (const [key, value] of Object.entries(notification.meta ?? {})) {
			message = message.replaceAll(`{${key}}`, String(value));
		}
		return message;
	});
</script>

<a
	href={notification.href}
	class="item"
	data-testid="notification-item"
	onclick={onClose}
>
	<div class="imageContainer">
		{#if unseen}
			<div class="unseenDot" data-testid="notification-unseen-dot"></div>
		{/if}
		{#if notification.pictureUrl}
			<img
				src={notification.pictureUrl}
				alt="Notification"
				class="itemImage"
				width={124}
				height={124}
			/>
		{:else}
			<Image
				path={navIconUrl(notification.navIcon)}
				width={24}
				height={24}
				alt=""
			/>
		{/if}
	</div>
	<div class="itemHeader">{text}</div>
	<div class="timestamp">
		{formatDistanceToNowLocalized(
			databaseTimestampToDate(notification.createdAt),
		)}
	</div>
</a>

<style>
	.imageContainer {
		place-self: center;
		grid-area: image;
		border-radius: var(--radius-avatar);
		width: 30px;
		height: 30px;
		background-color: var(--color-bg-high);
		display: grid;
		place-items: center;
		position: relative;
	}

	.item {
		padding: var(--s-1) var(--s-3);
		display: grid;
		grid-template-areas: "image header" "image timestamp";
		grid-template-columns: 30px 1fr;
		column-gap: var(--s-2);
		padding-block: var(--s-3);
		color: var(--color-text);

		&:hover .imageContainer {
			outline: 3px solid var(--color-bg-higher);
		}

		&:focus-within .imageContainer {
			outline: 3px solid var(--color-accent-low);
		}
	}

	.unseenDot {
		background-color: var(--color-text-accent);
		border-radius: 100%;
		width: 8px;
		height: 8px;
		position: absolute;
		top: -1px;
		left: -1px;
		outline: 2px solid var(--color-bg);
	}

	.itemImage {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-avatar);
	}

	.itemHeader {
		grid-area: header;
		font-size: var(--font-sm);
		font-weight: var(--weight-semi);
	}

	.timestamp {
		grid-area: timestamp;
		color: var(--color-text-high);
		font-size: var(--font-2xs);
		font-weight: var(--weight-body);
	}
</style>
