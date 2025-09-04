<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import { logger } from '$lib/utils/logger';
	import ClipboardCopy from '@lucide/svelte/icons/clipboard-copy';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		/** The content to copy to the clipboard. */
		content: string;
	}

	const { content }: Props = $props();

	let copied = $state(false);
	$effect(() => {
		if (!copied) return;

		const timeout = setTimeout(() => (copied = false), 1500);

		return () => clearTimeout(timeout);
	});

	async function handleCopyToClipboard() {
		try {
			await navigator.clipboard.writeText(content);
			copied = true;
		} catch (error) {
			// xxx: toast or something if NotAllowedError
			logger.error('Failed to copy invite link:', error);
		}
	}
</script>

<Button icon={copied ? ClipboardCheck : ClipboardCopy} size="small" onclick={handleCopyToClipboard}
	>{m.common_actions_copyToClipboard()}</Button
>
