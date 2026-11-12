<!-- `/calendar/new` for a calendar event (not a tournament); submitting is not ported, a valid submit only says so. -->
<script lang="ts">
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { SENDOUQ_MAP_POOL } from "~/features/match-profile/banned-maps";
import { calendarNewDefaultValues } from "~/features/calendar/calendar-new-defaults";
import { calendarNewSchema } from "~/features/calendar/calendar-new-schemas";
import type { BadgeOption, SelectOption } from "~/form/types";
import Main from "#lib/components/Main.svelte";
import type { MapPoolQuickFill } from "#lib/components/MapPoolPicker.svelte";
import { toastQueue } from "#lib/components/toast-queue.svelte.ts";
import FormField from "#lib/form/FormField.svelte";
import SendouStoreForm from "#lib/form/SendouStoreForm.svelte";
import { m } from "#lib/paraglide/messages.js";

interface Props {
	badgeOptions: BadgeOption[];
	organizationOptions: SelectOption[];
	/** Also true for a tournament adder without organizations, who gets the field with no options, like in the React app. */
	hasOrganizations: boolean;
}

let { badgeOptions, organizationOptions, hasOrganizations }: Props = $props();

const defaultValues = calendarNewDefaultValues({
	isAddingTournament: false,
	eventToEdit: undefined,
	eventToCopy: undefined,
});

const mapPoolQuickFill: MapPoolQuickFill[] = [
	{
		label: m.forms_mapPool_quickFill_sendouQ(),
		mapPool: new MapPool(
			SENDOUQ_MAP_POOL.stageModePairs.filter((pair) => pair.mode !== "TW"),
		),
	},
	{
		label: m.forms_mapPool_quickFill_rankedModes(),
		mapPool: MapPool.ANARCHY,
	},
];
</script>

<Main halfWidth>
	<div class="stack md">
		<div class="stack horizontal md items-center">
			<h1 class="text-lg">{m.calendar_pageTitle_newEvent()}</h1>
		</div>
		<SendouStoreForm
			schema={calendarNewSchema}
			{defaultValues}
			fullWidth
			onSubmit={() =>
				toastQueue.add({
					variant: "info",
					message: "Submitting is not ported to the Svelte slice",
				})}
		>
			<div class="stack md">
				<FormField name="name" />
				<div class="stack xs">
					<FormField name="description" />
				</div>
				{#if hasOrganizations}
					<FormField name="organizationId" options={organizationOptions} />
				{/if}
				<FormField name="date" />
				<FormField name="bracketUrl" />
				<FormField name="discordInviteCode" />
				<FormField name="tags" />
				{#if badgeOptions.length > 0}
					<FormField name="badges" options={badgeOptions} />
				{/if}
				<FormField name="pool" options={{ quickFill: mapPoolQuickFill }} />
			</div>
		</SendouStoreForm>
	</div>
</Main>
