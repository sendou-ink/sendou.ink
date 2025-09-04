<script lang="ts">
	import { PUBLIC_SITE_DOMAIN } from '$env/static/public';
	import Button from '$lib/components/buttons/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { m } from '$lib/paraglide/messages';
	import CopyToClipboardButton from '$lib/components/CopyToClipboardButton.svelte';

	interface Props {
		code: string;
		url: string;
		onReset: () => Promise<void>;
		resetPending: boolean;
	}

	const { code, url, onReset, resetPending }: Props = $props();
	const id = $props.id();

	const inviteLink = $derived(`${PUBLIC_SITE_DOMAIN}${url}?code=${code}`);
</script>

<div class="container stack">
	<label for={id}>{m.team_roster_inviteLink_header()}</label>
	<Input {id} disabled defaultValue={inviteLink} />
	<div class="stack horizontal md mt-4">
		<CopyToClipboardButton content={inviteLink} />
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
