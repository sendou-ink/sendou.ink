<script lang="ts">
	import Switch from '../Switch.svelte';
	import BottomText from './BottomText.svelte';

	// xxx: make a shared interface
	interface Props {
		label: string;
		name: string;
		bottomText?: string;
		checked?: boolean;
		// xxx: onchange
	}

	let { label, name, bottomText, checked = $bindable(false) }: Props = $props();
</script>

<div>
	<div class="stack horizontal sm items-center">
		<Switch {name} bind:checked>
			{label}
		</Switch>
	</div>
	{#if bottomText}
		<BottomText>{bottomText}</BottomText>
	{/if}
</div>
