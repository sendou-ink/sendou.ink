<script lang="ts">
import { Plus } from "@lucide/svelte";
import { Button, Menu, MenuItem } from "@sendou/components";
import Image from "#lib/components/Image.svelte";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { canAccessTrophies } from "#lib/features/trophies/trophies-utils.ts";
import { dynamicMessage } from "#lib/modules/i18n/messages.ts";
import { m } from "#lib/paraglide/messages.js";
import { navIconUrl, userPage } from "#lib/utils/urls.ts";

interface Props {
	compact?: boolean;
}

let { compact }: Props = $props();

const user = $derived(loggedInUser());

const items = $derived.by(() => {
	if (!user) return [];

	const all = [
		{ id: "tournament", icon: "medal", href: "/calendar/new/tournament" },
		{ id: "organization", icon: "medal", href: "/org/new" },
		{ id: "calendarEvent", icon: "calendar", href: "/calendar/new" },
		{ id: "build", icon: "builds", href: `${userPage(user)}/builds/new` },
		{ id: "team", icon: "t", href: "/t?new=true" },
		{ id: "scrimPost", icon: "scrims", href: "/scrims/new" },
		{ id: "association", icon: "associations", href: "/associations/new" },
		{ id: "lfgPost", icon: "lfg", href: "/lfg/new" },
		{ id: "art", icon: "art", href: "/art/new" },
		{ id: "vod", icon: "vods", href: "/vods/new" },
		{ id: "plusSuggestion", icon: "plus", href: "/plus/suggestions/new" },
		canAccessTrophies(user)
			? { id: "trophy", icon: "trophies", href: "/trophies/new" }
			: null,
	];

	return all.filter((item) => item !== null);
});
</script>

{#if user}
	<Menu>
		{#snippet trigger(triggerProps)}
			<Button
				size="small"
				shape={compact ? "square" : undefined}
				testId="anything-adder-menu-button"
				{...triggerProps}
			>
				{#snippet icon()}<Plus />{/snippet}
				{#if !compact}{`${m.common_actions_addNew()}…`}{/if}
			</Button>
		{/snippet}
		{#each items as item (item.id)}
			<MenuItem href={item.href} testId={`menu-item-${item.id}`}>
				{#snippet icon()}
					<Image path={navIconUrl(item.icon)} alt="" width={20} height={20} />
				{/snippet}
				{dynamicMessage(`common_header_adder_${item.id}`)}
			</MenuItem>
		{/each}
	</Menu>
{/if}
