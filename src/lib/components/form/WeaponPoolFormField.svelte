<script lang="ts">
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import type { FormFieldProps } from '$lib/form/types';
	import WeaponSelect from '../WeaponCombobox.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';

	type Props = FormFieldProps<'weapon-pool'> & {
		value?: Array<{
			weaponSplId: MainWeaponId;
			isFavorite: boolean;
		}>;
		onblur?: () => void;
	};

	let { label, name, bottomText, error, onblur, value = $bindable() }: Props = $props();
	const id = $props.id();

	let mid = $state<MainWeaponId>(20); // testing

	$inspect(mid);
</script>

<div class="stack xs">
	<Label for={id}>
		{label}
	</Label>
	<!-- <Select
		{name}
		{id}
		{onblur}
		{clearable}
		items={itemsWithLabels}
		bind:value
		{...ariaAttributes({
			id,
			bottomText,
			error
		})}
	/> -->
	<WeaponSelect {id} bind:value={mid} onselect={console.log} />
	<input type="hidden" {name} value={JSON.stringify(value ?? [])} />
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
