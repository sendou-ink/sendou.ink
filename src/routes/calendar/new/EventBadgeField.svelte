<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import Label from '$lib/components/form/Label.svelte';
	import { SMALL_BADGES_PER_DISPLAY_PAGE } from '$lib/api/user/schemas';
	import BadgesSelector from '$lib/components/badge/BadgesSelector.svelte';
	import * as BadgeAPI from '$lib/api/badge';

	interface Props extends FormFieldProps<'custom'> {
		name: string;
		value: number[];
	}

	let { name, label, value = $bindable([]) }: Props = $props();

	// xxx: (existing bug in main?), if someone else added the badge with access, and now they don't have it then this can have an unexpected result
	const badges = $derived(await BadgeAPI.queries.allBadgesManagedByMe());
</script>

{#if badges.length > 0}
	<div>
		<input type="hidden" {name} value={JSON.stringify(value)} />
		<Label>{label}</Label>
		<BadgesSelector
			bind:selectedBadges={value}
			options={badges}
			maxCount={SMALL_BADGES_PER_DISPLAY_PAGE + 1}
		/>
	</div>
{/if}
