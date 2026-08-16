<script lang="ts">
	import { getLocale } from "#lib/paraglide/runtime.js";
	import { countryCodeToTranslatedName } from "#lib/utils/i18n.ts";

	interface Props {
		countryCode: string;
		tiny?: boolean;
	}

	let { countryCode, tiny = false }: Props = $props();
</script>

<span
	class={[`twf twf-${countryCode.toLowerCase()}`, { "twf-s": tiny }]}
	data-testid="flag-{countryCode}"
	title={countryCodeToTranslatedName({
		countryCode,
		language: getLocale(),
	})}
></span>
