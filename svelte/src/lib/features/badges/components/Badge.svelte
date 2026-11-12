<script lang="ts">
import { badgeUrl } from "~/utils/urls";

interface Props {
	badge: { displayName: string; hue?: number | null; code: string };
	onclick?: () => void;
	size: number;
}

let { badge, onclick, size }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (mirrors the React badge) -->
<img
	src={badgeUrl({ code: badge.code, extension: "gif" })}
	alt={badge.displayName}
	title={badge.displayName}
	{onclick}
	width={size}
	height={size}
	style:filter={badge.hue ? `hue-rotate(${badge.hue}deg)` : undefined}
/>
