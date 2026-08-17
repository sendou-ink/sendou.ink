<script lang="ts">
import TimePopover from "#lib/components/TimePopover.svelte";

const FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	weekday: "short",
	year: "numeric",
	month: "numeric",
	day: "numeric",
	hour: "numeric",
	minute: "numeric",
};

interface Props {
	time: Date;
}

let { time }: Props = $props();
</script>

<TimePopover date={time} options={FORMAT_OPTIONS} class="font-semi-bold" />
