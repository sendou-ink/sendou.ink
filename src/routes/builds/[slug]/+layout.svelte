<!-- xxx: temporary fix for https://github.com/sveltejs/kit/issues/14139 -->
<script lang="ts">
	let { children } = $props();
</script>

{@render children()}
