<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import { m } from "#lib/paraglide/messages.js";
import type { CommonUser } from "#lib/server/kysely.ts";

const MAX_VISIBLE_AVATARS = 5;

interface Props {
	mutualFriends: Array<CommonUser>;
}

let { mutualFriends }: Props = $props();

const visibleFriends = $derived(mutualFriends.slice(0, MAX_VISIBLE_AVATARS));
const overflowCount = $derived(mutualFriends.length - MAX_VISIBLE_AVATARS);
</script>

<!--
@component
Static mutual friends avatar stack with a count, as shown on the user card.

xxx: React's `MutualFriends` also has an interactive variant (`withoutPopover={false}`, used
outside the card) where the stack is a popover trigger listing each friend as a `UserLink`;
that variant is not ported yet.
-->

{#if mutualFriends.length > 0}
	<div class="trigger">
		<div class="avatarStack">
			{#each visibleFriends as friend (friend.id)}
				<Avatar user={friend} size="xxs" class="stackedAvatar" />
			{/each}
		</div>
		{#if overflowCount > 0}
			<span class="overflow">+{overflowCount}</span>
		{/if}
		<span>
			{mutualFriends.length === 1
				? m.user_mutualFriends_count_one({ count: mutualFriends.length })
				: m.user_mutualFriends_count_other({ count: mutualFriends.length })}
		</span>
	</div>
{/if}

<style>
	.trigger {
		display: flex;
		align-items: center;
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);

		span {
			color: var(--color-text-high);
		}
	}

	.avatarStack {
		display: flex;
		align-items: center;

		& :global(.stackedAvatar) {
			border-radius: 50%;
			border: 2px solid var(--color-bg);

			&:not(:first-child) {
				margin-inline-start: -8px;
			}
		}
	}

	.overflow {
		font-size: var(--font-xs);
		margin-inline: var(--s-1);
	}
</style>
