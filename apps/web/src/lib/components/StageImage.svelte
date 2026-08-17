<script lang="ts">
import type { StageId } from "@sendou/in-game-lists/types";
import { stageName } from "#lib/modules/i18n/messages.ts";
import { stageImageUrl } from "#lib/utils/urls.ts";
import Image from "./Image.svelte";

interface Props {
	stageId: StageId;
	class?: string;
	containerClass?: string;
	width?: number;
	height?: number;
	testId?: string;
	loading?: "lazy" | "eager";
}

let { stageId, height, ...rest }: Props = $props();

const label = $derived(stageName(stageId));
const resolvedHeight = $derived(
	height ?? (rest.width ? rest.width * 0.5625 : undefined),
);
</script>

<Image
	{...rest}
	alt={label}
	title={label}
	path={stageImageUrl(stageId)}
	height={resolvedHeight}
/>
