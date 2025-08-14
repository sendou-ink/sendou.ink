<script lang="ts">
	import { errorMessageId, infoMessageId } from './utils';

	interface Props {
		error?: string;
		info?: string;
		fieldId: string;
	}

	let { error, info, fieldId }: Props = $props();
</script>

{#if info || error}
	<div>
		{#if error}
			<div class="info-message error" id={errorMessageId(fieldId)}>
				{error}
			</div>
		{/if}
		{#if info}
			<div class="info-message" id={infoMessageId(fieldId)}>
				{info}
			</div>
		{/if}
	</div>
{/if}

<style>
	.info-message {
		display: block;
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xs);
		text-wrap: balance;
	}

	.error {
		color: var(--color-error);
	}
</style>
