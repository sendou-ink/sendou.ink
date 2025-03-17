<script lang="ts">
	import type { Snippet } from "svelte";

	interface ButtonProps {
		children: Snippet;
		variant?: "primary" | "outline";
		onClick?: () => void;
		type?: "button" | "submit";
	}

	let { children, variant = "primary", onClick, type = "button" }: ButtonProps = $props();
</script>

<button
	class={[
		"btn",
		"btn-primary",
		{
			"btn-outline": variant === "outline",
		},
	]}
	onclick={onClick}
	{type}
>
	{@render children()}
</button>
