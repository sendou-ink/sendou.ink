<script lang="ts">
	import "#lib/styles/fonts.css";
	import "#lib/styles/vars.css";
	import "#lib/styles/normalize.css";
	import "#lib/styles/common.css";
	import "#lib/styles/utils.css";
	import "#lib/styles/flags.css";

	let { children } = $props();
</script>

{@render children()}
