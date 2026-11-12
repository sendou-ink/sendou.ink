<script lang="ts">
import CalendarNewEventPage from "#lib/features/calendar/components/CalendarNewEventPage.svelte";
import { getCalendarNewOptions } from "#lib/features/calendar/calendar.remote.ts";
import { m } from "#lib/paraglide/messages.js";

const options = $derived(await getCalendarNewOptions());
</script>

<svelte:head>
	<title>{m.calendar_pageTitle_newEvent()} | sendou.ink</title>
</svelte:head>

<CalendarNewEventPage {...options} />
