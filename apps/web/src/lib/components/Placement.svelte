<script lang="ts">
	import { getLocale } from "#lib/paraglide/runtime.js";
	import { ordinalSuffix } from "#lib/utils/i18n.ts";
	import {
		FIRST_PLACEMENT_ICON_PATH,
		SECOND_PLACEMENT_ICON_PATH,
		THIRD_PLACEMENT_ICON_PATH,
	} from "#lib/utils/urls.ts";

	interface Props {
		placement: number;
		iconClass?: string;
		textClass?: string;
		size?: number;
		textOnly?: boolean;
		showAsSuperscript?: boolean;
	}

	let {
		placement,
		iconClass,
		textClass,
		size = 20,
		textOnly = false,
		showAsSuperscript = true,
	}: Props = $props();

	const suffix = $derived(ordinalSuffix(placement, getLocale()));
	const isSuperscript = $derived(showAsSuperscript && suffix.startsWith("^"));
	const ordinalSuffixText = $derived(suffix.replace(/^\^/, ""));

	const iconPath = $derived.by(() => {
		if (textOnly) return null;
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
	});

	const placementString = $derived(`${placement}${ordinalSuffixText}`);
</script>

{#if !iconPath}
	<span class={textClass}
		>{placement}{#if isSuperscript}<sup>{ordinalSuffixText}</sup
			>{:else}{ordinalSuffixText}{/if}</span
	>
{:else}
	<img
		alt={placementString}
		title={placementString}
		src={iconPath}
		class={iconClass}
		height={size}
		width={size}
	/>
{/if}
