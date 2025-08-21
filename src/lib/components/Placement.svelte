<script lang="ts">
	import {
		FIRST_PLACEMENT_ICON_PATH,
		SECOND_PLACEMENT_ICON_PATH,
		THIRD_PLACEMENT_ICON_PATH
	} from '$lib/utils/urls';

	interface Props {
		placement: number;
		iconClassName?: string;
		textClassName?: string;
		size?: number;
		textOnly?: boolean;
		/** Render plain text, no icon or wrapping html elements */
		plain?: boolean;
		showAsSuperscript?: boolean;
	}

	let {
		placement,
		iconClassName,
		textClassName,
		size = 20,
		textOnly = false,
		showAsSuperscript = true,
		plain = false
	}: Props = $props();

	function getSpecialPlacementIconPath(placement: number): string | null {
		switch (placement) {
			case 3:
				return THIRD_PLACEMENT_ICON_PATH;
			case 2:
				return SECOND_PLACEMENT_ICON_PATH;
			case 1:
				return FIRST_PLACEMENT_ICON_PATH;
			default:
				return null;
		}
	}

	let ordinalSuffix = ''; // xxx: add ordinal suffix

	let isSuperscript = $derived(showAsSuperscript && ordinalSuffix.startsWith('^'));
	let ordinalSuffixText = $derived(ordinalSuffix.replace(/^\^/, ''));
	let iconPath = $derived(textOnly ? null : getSpecialPlacementIconPath(placement));
	let placementString = $derived(`${placement}${ordinalSuffixText}`);
</script>

{#if plain}
	{placement}{ordinalSuffixText}
{:else if !iconPath}
	<span class={textClassName}>
		{placement}
		{#if isSuperscript}
			<sup>{ordinalSuffixText}</sup>
		{:else}
			{ordinalSuffixText}
		{/if}
	</span>
{:else}
	<img
		alt={placementString}
		title={placementString}
		src={iconPath}
		class={iconClassName}
		height={size}
		width={size}
	/>
{/if}
