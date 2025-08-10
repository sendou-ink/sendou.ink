<script lang="ts">
	import Switch from '../Switch.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';

	// xxx: make a shared interface
	interface Props {
		label: string;
		name: string;
		bottomText?: string;
		// xxx: onchange
	}

	const id = $props.id();

	// xxx: doing label this way doesn't allow for clicking label to change the selection

	let { label, name, bottomText }: Props = $props();
</script>

<div>
	<div class="stack horizontal sm items-center">
		<Switch {id} {name} />
		<Label for={id}>
			{label}
		</Label>
	</div>
	{#if bottomText}
		<BottomText>{bottomText}</BottomText>
	{/if}
</div>
