<script lang="ts" module>
export interface NotFoundVisibilityValue {
	at: Date | null;
	forAssociation: string;
}

export const DEFAULT_NOT_FOUND_VISIBILITY: NotFoundVisibilityValue = {
	at: null,
	forAssociation: "PUBLIC",
};
</script>

<script lang="ts">
import DatePicker from "#lib/components/DatePicker.svelte";
import Label from "#lib/components/Label.svelte";
import { getFormContext } from "#lib/form/form-context.ts";
import { errorMessageId, translateFormText } from "#lib/form/form-utils.ts";
import { m } from "#lib/paraglide/messages.js";
import AssociationSelect from "./AssociationSelect.svelte";

interface Props {
	associations: {
		virtual: string[];
		actual: Array<{ id: number; name: string }>;
	};
}

let { associations }: Props = $props();

const context = getFormContext();

const baseVisibility = $derived(context.value("baseVisibility") as string);
const notFoundVisibility = $derived(
	context.value("notFoundVisibility") as NotFoundVisibilityValue,
);

// a public post can't have a delayed visibility expansion, so flipping back to
// PUBLIC clears the whole sub-field
$effect(() => {
	if (baseVisibility !== "PUBLIC") return;
	if (
		notFoundVisibility.at === null &&
		notFoundVisibility.forAssociation === "PUBLIC"
	) {
		return;
	}
	context.setValue("notFoundVisibility", DEFAULT_NOT_FOUND_VISIBILITY);
});

const error = $derived(context.displayedError("notFoundVisibility"));

const noAssociations = $derived(
	associations.virtual.length === 0 && associations.actual.length === 0,
);

function handleDateChange(date: Date | null) {
	context.setValue("notFoundVisibility", {
		...notFoundVisibility,
		at: date,
	});
}

function handleAssociationChange(value: string) {
	context.setValue("notFoundVisibility", {
		...notFoundVisibility,
		forAssociation: value,
	});
}
</script>

{#if !noAssociations && baseVisibility !== "PUBLIC"}
	<div>
		<div class="stack horizontal sm">
			<div class="datePickerFullWidth">
				<DatePicker
					label={m.scrims_forms_notFoundVisibility_title()}
					granularity="minute"
					errorText={error ? translateFormText(error) : undefined}
					errorId={errorMessageId("notFoundVisibility")}
					value={notFoundVisibility.at}
					onChange={handleDateChange}
					bottomText={notFoundVisibility.at
						? undefined
						: m.scrims_forms_notFoundVisibility_explanation()}
				/>
			</div>
			{#if notFoundVisibility.at}
				<div class="w-full">
					<Label htmlFor="not-found-visibility">
						{m.scrims_forms_visibility_title()}
					</Label>
					<AssociationSelect
						{associations}
						id="not-found-visibility"
						value={String(notFoundVisibility.forAssociation)}
						onChange={handleAssociationChange}
					/>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.datePickerFullWidth {
		width: 100%;
	}
</style>
