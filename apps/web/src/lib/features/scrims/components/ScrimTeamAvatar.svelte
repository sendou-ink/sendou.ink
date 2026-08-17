<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import NoteAvatar from "#lib/components/NoteAvatar.svelte";
import UserCard from "#lib/features/user-page/components/UserCard.svelte";
import { getUserCardContext } from "#lib/features/user-page/user-card-context.ts";
import type { ScrimPostUser } from "../scrims-types.ts";

interface Props {
	teamAvatarUrl: string | null | undefined;
	teamName: string;
	owner: ScrimPostUser;
}

let { teamAvatarUrl, teamName, owner }: Props = $props();

const cards = getUserCardContext();
const cardData = $derived(cards?.userCards()?.get(owner.id));
</script>

{#if teamAvatarUrl}
	<Avatar size="xs" url={teamAvatarUrl} alt={teamName} />
{:else}
	<UserCard userId={owner.id} withMutualFriends>
		<NoteAvatar sentiment={cardData?.privateNote?.sentiment} size="sm">
			<Avatar size="xs" user={owner} alt={owner.username} />
		</NoteAvatar>
	</UserCard>
{/if}
