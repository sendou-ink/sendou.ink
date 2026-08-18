<script lang="ts">
import { Users } from "@lucide/svelte";
import { Button, Popover } from "@sendou/components";
import Avatar from "#lib/components/Avatar.svelte";
import NoteAvatar from "#lib/components/NoteAvatar.svelte";
import UserCard from "#lib/features/user-page/components/UserCard.svelte";
import type { ScrimPostUser } from "../scrims-types.ts";

interface Props {
	users: ScrimPostUser[];
}

let { users }: Props = $props();
</script>

<Popover>
	{#snippet trigger(triggerProps)}
		<Button variant="minimal" {...triggerProps}>
			{#snippet icon()}<Users class="scrimUsersIcon" />{/snippet}
		</Button>
	{/snippet}
	<div class="stack md">
		{#each users as user (user.id)}
			<UserCard userId={user.id} withMutualFriends>
				{#snippet children(card)}
					<span class="stack horizontal sm items-center">
						<NoteAvatar sentiment={card?.privateNote?.sentiment} size="xs">
							<Avatar size="xxs" {user} />
						</NoteAvatar>
						{user.username}
					</span>
				{/snippet}
			</UserCard>
		{/each}
	</div>
</Popover>

<style>
	/* the React app sizes the icon itself (18px) inside the 20px button icon
	   slot; the tripled class out-specifies Button's own svg sizing */
	:global(.scrimUsersIcon.scrimUsersIcon.scrimUsersIcon) {
		height: 18px;
	}
</style>
