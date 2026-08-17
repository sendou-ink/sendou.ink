<script lang="ts">
import TournamentSearch from "#lib/components/TournamentSearch.svelte";
import type { TournamentSearchItem } from "#lib/features/tournament/tournament-search.remote.ts";
import { translateFormText } from "../form-utils.ts";
import FormFieldMessages from "./FormFieldMessages.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	error?: string;
	required?: boolean;
	onBlur?: (latestValue?: unknown) => void;
	value: number | null;
	onChange: (value: number | null) => void;
	onTournamentSelected?: (tournament: TournamentSearchItem | null) => void;
	pastOnly?: boolean;
	disabled?: boolean;
}

let {
	name,
	label,
	bottomText,
	error,
	required,
	value,
	onChange,
	onTournamentSelected,
	pastOnly,
	disabled,
}: Props = $props();

const translatedLabel = $derived(translateFormText(label));
</script>

<div class="root">
	<div class="stack xs">
		<TournamentSearch
			initialTournamentId={value ?? undefined}
			{pastOnly}
			onChange={(tournament) => {
				onChange(tournament?.id ?? null);
				onTournamentSelected?.(tournament);
			}}
			label={translatedLabel}
			isRequired={required}
			isDisabled={disabled}
		/>
		<FormFieldMessages {name} {error} {bottomText} />
	</div>
</div>

<style>
	.root {
		width: 100%;

		& :global(button) {
			width: 100%;
		}
	}
</style>
