<script lang="ts">
	import { PUBLIC_SITE_DOMAIN } from '$env/static/public';
	import Button from '$lib/components/buttons/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { logger } from '$lib/utils/logger';
	import ClipboardCopy from '@lucide/svelte/icons/clipboard-copy';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		code: string;
		url: string;
		onReset: () => Promise<void>;
		resetPending: boolean;
	}

	const { code, url, onReset, resetPending }: Props = $props();
	const id = $props.id();

	let copied = $state(false);
	$effect(() => {
		if (!copied) return;

		const timeout = setTimeout(() => (copied = false), 1500);

		return () => clearTimeout(timeout);
	});

	const inviteLink = $derived(`${PUBLIC_SITE_DOMAIN}${url}?code=${code}`);

	async function handleCopyToClipboard() {
		try {
			await navigator.clipboard.writeText(inviteLink);
			copied = true;
		} catch (error) {
			// xxx: toast or something if NotAllowedError
			logger.error('Failed to copy invite link:', error);
		}
	}
</script>

<div class="container stack">
	<label for={id}>{m.team_roster_inviteLink_header()}</label>
	<Input {id} disabled defaultValue={inviteLink} />
	<div class="stack horizontal md mt-4">
		<Button
			icon={copied ? ClipboardCheck : ClipboardCopy}
			size="small"
			onclick={handleCopyToClipboard}>{m.common_actions_copyToClipboard()}</Button
		>
		<Button
			variant="minimal-destructive"
			size="miniscule"
			onclick={async () => await onReset()}
			loading={resetPending}>{m.common_actions_reset()}</Button
		>
	</div>
</div>

<style>
	.container {
		--input-width: 22rem;
	}
	label {
		display: block;
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);
		margin-block-end: var(--s-1-5);
	}
</style>
