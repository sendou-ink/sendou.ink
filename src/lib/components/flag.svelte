<script lang="ts">
	import { getLocale } from '$lib/paraglide/runtime';
	import { countryCodeToTranslatedName } from '$lib/utils/i18n';

	interface Props {
		countryCode: string;
		tiny?: boolean;
	}

	let { countryCode, tiny = false }: Props = $props();

	const title = $derived(
		countryCodeToTranslatedName({
			countryCode,
			language: getLocale()
		})
	);

	// xxx: popover so it works for mobile too
</script>

<div
	class={[
		'twf',
		`twf-${countryCode.toLowerCase()}`,
		{
			'twf-s': tiny
		}
	]}
	data-testid={`flag-${countryCode}`}
	{title}
></div>
