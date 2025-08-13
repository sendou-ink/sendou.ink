<script lang="ts">
	interface Props {
		error?: string;
		info?: string;
	}

	let { error, info }: Props = $props();
</script>

{#if info || error}
	<div>
		{#if error}
			<div class="info-message error">
				{error}
			</div>
		{/if}
		{#if info}
			<div class="info-message">
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
		margin-block-start: var(--s-1-5);
		text-wrap: balance;
	}

	.error {
		color: var(--color-error);
	}
</style>
