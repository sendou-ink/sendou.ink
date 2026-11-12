<script lang="ts">
import type { ComponentProps } from "svelte";
import type { ClassValue } from "svelte/elements";
import type { Tables } from "~/db/tables";
import type { CommonUser } from "~/utils/kysely.server";
import { userPage } from "~/utils/urls";
import Avatar from "./Avatar.svelte";

interface Props {
	user: Pick<CommonUser, "id" | "username" | "avatar"> & {
		customUrl?: Tables["User"]["customUrl"];
	};
	size?: ComponentProps<typeof Avatar>["size"];
	class?: ClassValue;
}

let { user, size = "xxs", class: className }: Props = $props();
</script>

<!-- the user page is still served by the React app, so the link is a document navigation -->
<a href={userPage(user)} class={["user-link", className]} data-sveltekit-reload>
	<Avatar {user} {size} />
	{user.username}
</a>

<style>
	@layer components {
		.user-link {
			display: inline-flex;
			align-items: center;
			gap: var(--s-1-5);
			color: var(--color-text);
		}
	}
</style>
