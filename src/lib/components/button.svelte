<script lang="ts">
	import type { Snippet } from "svelte";

	interface ButtonProps {
		children: Snippet;
		variant?: "primary" | "outline";
	}

	let { children, variant = "primary" }: ButtonProps = $props();
</script>

<button
	class={[
		"btn",
		"btn-primary",
		{
			"btn-outline": variant === "outline",
		},
	]}
>
	{@render children()}
</button>
