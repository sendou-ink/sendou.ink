<script lang="ts">
import { Switch } from "@sendou/components";
import { translateFormText } from "../form-utils.ts";
import FormFieldMessages from "./FormFieldMessages.svelte";

interface Props {
	name: string;
	label?: string;
	bottomText?: string;
	error?: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	isDisabled?: boolean;
}

let { name, label, bottomText, error, checked, onChange, isDisabled }: Props =
	$props();

const id = $props.id();

const translatedLabel = $derived(translateFormText(label));
</script>

<div class="stack xs">
	<div class="stack horizontal sm items-center">
		<Switch {id} isSelected={checked} {onChange} {isDisabled}>
			{translatedLabel}
		</Switch>
	</div>
	<FormFieldMessages {name} {error} {bottomText} />
</div>
