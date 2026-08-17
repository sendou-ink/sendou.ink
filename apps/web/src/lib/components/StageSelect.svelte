<script lang="ts">
import { Select, SelectItem } from "@sendou/components";
import { stageIds } from "@sendou/in-game-lists/stage-ids";
import type { StageId } from "@sendou/in-game-lists/types";
import { stageName } from "#lib/modules/i18n/messages.ts";
import { m } from "#lib/paraglide/messages.js";
import { stageImageUrl } from "#lib/utils/urls.ts";
import Image from "./Image.svelte";

interface Props {
	label?: string;
	value?: StageId | null;
	initialValue?: StageId;
	onChange?: (stageId: StageId) => void;
	testId?: string;
	isRequired?: boolean;
	isDisabled?: boolean;
}

let {
	label,
	value,
	initialValue,
	onChange,
	testId = "stage-select",
	isRequired,
	isDisabled,
}: Props = $props();

// svelte-ignore state_referenced_locally -- controlled vs. uncontrolled is decided once at mount
const isControlled = value !== undefined;

let searchValue = $state("");

const allItems = $derived(
	stageIds.map((id) => ({ id: id as StageId, name: stageName(id) })),
);

const visibleItems = $derived(
	searchValue === ""
		? allItems
		: allItems.filter((item) =>
				item.name.toLowerCase().includes(searchValue.toLowerCase()),
			),
);

function handleSelectionChange(key: string | number | null) {
	if (key === null) return;
	onChange?.(Number(key) as StageId);
}
</script>

<Select
	aria-label={!label ? m.common_forms_stageSearch_placeholder() : undefined}
	{label}
	placeholder={m.common_forms_stageSearch_placeholder()}
	search={{ placeholder: m.common_forms_stageSearch_search_placeholder() }}
	bind:searchValue
	selectedKey={isControlled ? value : undefined}
	defaultSelectedKey={isControlled ? undefined : initialValue}
	onSelectionChange={handleSelectionChange}
	{testId}
	{isRequired}
	{isDisabled}
>
	{#each visibleItems as item (item.id)}
		<SelectItem id={item.id} textValue={item.name}>
			<div class="item">
				<Image
					path={stageImageUrl(item.id)}
					alt=""
					width={42}
					height={Math.round(42 * 0.5625)}
					class="stageImg"
				/>
				<span
					class="stageLabel"
					data-testid={`stage-select-option-${item.name}`}
				>
					{item.name}
				</span>
			</div>
		</SelectItem>
	{/each}
</Select>

<style>
	.item {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}

	.item :global(.stageImg) {
		border-radius: var(--radius-field);
	}

	.stageLabel {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
</style>
