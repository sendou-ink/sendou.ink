<script lang="ts">
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { m } from "#lib/paraglide/messages.js";
import Button from "./Button.svelte";
import Dialog from "./Dialog.svelte";
import FormMessage from "./FormMessage.svelte";
import type { MapPoolQuickFill } from "./MapPoolPicker.svelte";
import Popover from "./Popover.svelte";

interface Props {
	presets: MapPoolQuickFill[];
	disabled?: boolean;
	isPoolEmpty: boolean;
	onFill: (mapPool: MapPool) => void;
}

let { presets, disabled, isPoolEmpty, onFill }: Props = $props();

const pasteInputId = $props.id();

let isClearConfirmOpen = $state(false);
let isPasteOpen = $state(false);
let link = $state("");

const isInvalidLink = $derived(
	link.trim() !== "" && !MapPool.fromUserInput(link),
);

function handleLinkInput(event: Event & { currentTarget: HTMLInputElement }) {
	link = event.currentTarget.value;

	const mapPool = MapPool.fromUserInput(link);
	if (mapPool) {
		onFill(mapPool);
		isPasteOpen = false;
		link = "";
	}
}
</script>

<div class="quick-fill">
	<span class="quick-fill-label">{m.forms_mapPool_quickFill()}</span>
	{#each presets as preset (preset.label)}
		<Button
			variant="outlined"
			size="small"
			class="quick-fill-button"
			isDisabled={disabled || !isPoolEmpty}
			onclick={() => onFill(preset.mapPool)}
		>
			{preset.label}
		</Button>
	{/each}
	<Button
		variant="outlined-destructive"
		size="small"
		class="quick-fill-button"
		isDisabled={disabled || isPoolEmpty}
		onclick={() => {
			isClearConfirmOpen = true;
		}}
	>
		{m.common_actions_clear()}
	</Button>
	<Popover bind:isOpen={isPasteOpen} class="paste-popover">
		{#snippet trigger(attributes)}
			<Button
				{...attributes}
				variant="outlined"
				size="small"
				class="quick-fill-button"
				isDisabled={disabled || !isPoolEmpty}
			>
				{m.forms_mapPool_pasteLink()}
			</Button>
		{/snippet}
		<div class="paste">
			<label for={pasteInputId}>{m.forms_mapPool_pasteLinkLabel()}</label>
			<input
				id={pasteInputId}
				value={link}
				data-autofocus
				placeholder={m.forms_placeholders_scrimMapPool()}
				oninput={handleLinkInput}
				onkeydown={(event) => {
					// the popover may sit inside a form, enter would submit it
					if (event.key === "Enter") event.preventDefault();
				}}
			/>
			{#if isInvalidLink}
				<FormMessage type="error">{m.forms_errors_invalidMapPool()}</FormMessage>
			{/if}
		</div>
	</Popover>
</div>
{#if isClearConfirmOpen}
	<Dialog
		isDismissable
		onClose={() => {
			isClearConfirmOpen = false;
		}}
	>
		<div class="stack md">
			<h2 class="text-md text-center">{m.forms_mapPool_clearConfirm()}</h2>
			<div class="stack horizontal md justify-center mt-2">
				<Button
					variant="destructive"
					testId="confirm-button"
					onclick={() => {
						isClearConfirmOpen = false;
						onFill(MapPool.EMPTY);
					}}
				>
					{m.common_actions_clear()}
				</Button>
			</div>
		</div>
	</Dialog>
{/if}

<style>
	@layer components {
		.quick-fill {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--s-2);

			& :global(.quick-fill-button) {
				border-radius: var(--radius-full);
			}

			& :global(.paste-popover) {
				max-width: min(26rem, 100vw);
				padding: var(--s-3);
			}
		}

		.quick-fill-label {
			color: var(--color-text-high);
			font-size: var(--font-xs);
			font-weight: var(--weight-semi);
			margin-inline-end: var(--s-1);
		}

		.paste {
			display: flex;
			flex-direction: column;
			gap: var(--s-1-5);
			width: 24rem;
			max-width: 100%;
		}
	}
</style>
