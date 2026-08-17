<script lang="ts">
import { TabPanel } from "@sendou/components";
import type { Snippet } from "svelte";
import { TAB_KEYS } from "./match-page-constants.ts";
import MatchTimeline, {
	type MatchTimelineProps,
} from "./MatchTimeline.svelte";

interface Props extends MatchTimelineProps {
	children?: Snippet;
}

let { children, ...timelineProps }: Props = $props();
</script>

<TabPanel id={TAB_KEYS.RESULT}>
	<MatchTimeline {...timelineProps} />
	{@render children?.()}
</TabPanel>
