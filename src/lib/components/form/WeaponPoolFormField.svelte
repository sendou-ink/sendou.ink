<script lang="ts">
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import type { FormFieldProps } from '$lib/form/types';
	import WeaponSelect from '../WeaponSelect.svelte';
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

	$inspect(value);
</script>

<div>
	<Label for={id} withMargin>
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
	<WeaponSelect {id} onselect={console.log} />
	<input type="hidden" {name} value={JSON.stringify(value ?? [])} />
	<BottomText info={bottomText} {error} fieldId={id} />
</div>
