<script lang="ts">
import { Users } from "@lucide/svelte";
import { Popover } from "@sendou/components";
import Avatar from "#lib/components/Avatar.svelte";
import NoteAvatar from "#lib/components/NoteAvatar.svelte";
import UserCard from "#lib/features/user-page/components/UserCard.svelte";
import { getUserCardContext } from "#lib/features/user-page/user-card-context.ts";
import type { ScrimPostUser } from "../scrims-types.ts";

interface Props {
	users: ScrimPostUser[];
}

let { users }: Props = $props();

const cards = getUserCardContext();
</script>

<Popover>
	{#snippet trigger(triggerProps)}
		<button type="button" class="minimalButton" {...triggerProps}>
			<Users class="usersIcon" />
		</button>
	{/snippet}
	<div class="stack md">
		{#each users as user (user.id)}
			<UserCard userId={user.id} withMutualFriends>
				<span class="stack horizontal sm items-center">
					<NoteAvatar
						sentiment={cards?.userCards()?.get(user.id)?.privateNote
							?.sentiment}
						size="xs"
					>
						<Avatar size="xxs" {user} />
					</NoteAvatar>
					{user.username}
				</span>
			</UserCard>
		{/each}
	</div>
</Popover>

<style>
	.minimalButton {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		color: var(--color-text);
		border-radius: var(--radius-field);

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}
	}

	.minimalButton :global(.usersIcon) {
		width: 18px;
		height: 18px;
	}
</style>
