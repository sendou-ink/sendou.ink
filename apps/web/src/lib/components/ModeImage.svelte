<script lang="ts">
import { modeLongName } from "#lib/modules/i18n/messages.ts";
import { modeImageUrl } from "#lib/utils/urls.ts";
import Image from "./Image.svelte";

interface Props {
	mode: string;
	title?: string;
	class?: string;
	width?: number;
	height?: number;
	size?: number;
	testId?: string;
	loading?: "lazy" | "eager";
}

let { mode, title, ...rest }: Props = $props();

const label = $derived(title ?? modeLongName(mode));
</script>

<Image {...rest} alt={label} title={label} path={modeImageUrl(mode)} />
