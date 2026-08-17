<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import NoteAvatar from "#lib/components/NoteAvatar.svelte";
import UserCard from "#lib/features/user-page/components/UserCard.svelte";
import { getUserCardContext } from "#lib/features/user-page/user-card-context.ts";
import { m } from "#lib/paraglide/messages.js";
import type { ScrimPostUser } from "../scrims-types.ts";

interface Props {
	users: ScrimPostUser[];
}

let { users }: Props = $props();

const cards = getUserCardContext();

const sortedUsers = $derived(
	[...users].sort((a, b) => Number(b.isOwner) - Number(a.isOwner)),
);
</script>

<div class="stack md">
	{#each sortedUsers as user (user.id)}
		<UserCard userId={user.id} withMutualFriends>
			<span class="stack horizontal sm items-center">
				<NoteAvatar
					sentiment={cards?.userCards()?.get(user.id)?.privateNote?.sentiment}
					size="sm"
				>
					<Avatar size="xs" {user} />
				</NoteAvatar>
				<span>
					{user.username}
					{#if user.isOwner}
						<div class="text-lighter text-xs">
							{m.scrims_cancelRequestModal_requester()}
						</div>
					{/if}
				</span>
			</span>
		</UserCard>
	{/each}
</div>
