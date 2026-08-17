<script lang="ts">
import { Button } from "@sendou/components";
import type { ComponentProps, Snippet } from "svelte";

type ButtonProps = ComponentProps<typeof Button>;

interface Props {
	variant?: ButtonProps["variant"];
	size?: ButtonProps["size"];
	icon?: Snippet;
	testId?: string;
	isDisabled?: boolean;
	/** Pending state of the mutation this button submits (disables the button). */
	pending?: boolean;
	children?: Snippet;
}

let {
	variant,
	size,
	icon,
	testId,
	isDisabled,
	pending = false,
	children,
}: Props = $props();
</script>

<Button
	{variant}
	{size}
	{icon}
	type="submit"
	disabled={isDisabled || pending}
	testId={testId ?? "submit-button"}
>
	{#if children}{@render children()}{/if}
</Button>
