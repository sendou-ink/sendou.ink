<script lang="ts" module>
type FriendActivityBadge = "MATCH" | "NEXT";

const ACTIVITY_BADGE: Record<FriendActivityType, FriendActivityBadge | null> = {
	SENDOUQ_MATCH: "MATCH",
	TOURNAMENT_MATCH: "MATCH",
	TOURNAMENT_WAITING: "NEXT",
	SENDOUQ: null,
	TOURNAMENT_SUB: null,
};

function resolveActivity(friend: {
	activityType: FriendActivityType | null;
	matchId: number | null;
	tournamentId: number | null;
}) {
	switch (friend.activityType) {
		case "SENDOUQ_MATCH":
			return friend.matchId
				? ({
						type: "view-match",
						url: sendouQMatchPage(friend.matchId),
					} as const)
				: null;
		case "TOURNAMENT_MATCH":
			return friend.tournamentId && friend.matchId
				? ({
						type: "view-match",
						url: `${tournamentPage(friend.tournamentId)}/matches/${friend.matchId}`,
					} as const)
				: null;
		case "TOURNAMENT_WAITING":
			return friend.tournamentId
				? ({
						type: "view-tournament",
						url: tournamentPage(friend.tournamentId),
					} as const)
				: null;
		case "SENDOUQ":
			return { type: "join-sendouq" } as const;
		case "TOURNAMENT_SUB":
			return friend.tournamentId
				? ({
						type: "view-tournament",
						url: `${tournamentPage(friend.tournamentId)}/subs`,
					} as const)
				: null;
		default:
			return null;
	}
}
</script>

<script lang="ts">
	import { Swords, User } from "@lucide/svelte";
	import { Menu, MenuItem } from "@sendou/components";
	import TwitchIcon from "#lib/components/icons/TwitchIcon.svelte";
	import { m } from "#lib/paraglide/messages.js";
	import { sendouQMatchPage, tournamentPage } from "#lib/utils/urls.ts";
	import type { FriendActivityType } from "./layout-types.ts";
	import ListButton from "./ListButton.svelte";

	interface Props {
		discordId: string;
		discordAvatar: string | null;
		customAvatarUrl: string | null;
		name: string;
		subtitle: string | null;
		badge: string | null;
		url: string;
		activityType: FriendActivityType | null;
		matchId: number | null;
		tournamentId: number | null;
		streamUrl: string | null;
		onNavigate?: () => void;
	}

	let {
		discordId,
		discordAvatar,
		customAvatarUrl,
		name,
		subtitle,
		badge,
		url,
		activityType,
		matchId,
		tournamentId,
		streamUrl,
		onNavigate,
	}: Props = $props();

	const activityBadge = $derived(
		activityType ? ACTIVITY_BADGE[activityType] : null,
	);
	const activity = $derived(
		resolveActivity({ activityType, matchId, tournamentId }),
	);

	const badgeText = $derived(
		streamUrl
			? m.friends_friendsList_live()
			: activityBadge === "MATCH"
				? m.friends_friendsList_inMatch()
				: activityBadge === "NEXT"
					? m.friends_friendsList_nextMatch()
					: badge,
	);
</script>

<Menu>
	{#snippet trigger(triggerProps)}
		<ListButton
			user={{ discordId, discordAvatar, customAvatarUrl }}
			{subtitle}
			badge={badgeText}
			badgeVariant={streamUrl ? "warning" : "default"}
			aria-expanded={triggerProps["aria-expanded"]}
			aria-haspopup={triggerProps["aria-haspopup"]}
			onclick={triggerProps.onclick}
		>
			{name}
		</ListButton>
	{/snippet}
	<MenuItem href={url}>
		{#snippet icon()}<User />{/snippet}
		{m.friends_friendsList_viewUserPage()}
	</MenuItem>
	{#if streamUrl}
		<MenuItem href={streamUrl}>
			{#snippet icon()}<TwitchIcon />{/snippet}
			{m.friends_friendsList_watchStream()}
		</MenuItem>
	{/if}
	{#if activity?.type === "view-match"}
		<MenuItem href={activity.url}>
			{#snippet icon()}<Swords />{/snippet}
			{m.friends_friendsList_viewMatch()}
		</MenuItem>
	{/if}
	{#if activity?.type === "view-tournament"}
		<MenuItem href={activity.url}>
			{#snippet icon()}<Swords />{/snippet}
			{m.friends_friendsList_viewTournament()}
		</MenuItem>
	{/if}
</Menu>
