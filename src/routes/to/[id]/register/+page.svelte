<script>
	import FriendCodeGate from '$lib/components/FriendCodeGate.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import StatusCircle from './StatusCircle.svelte';
</script>

<Main
	><FriendCodeGate>
		<div class="stack lg">
			<StatusCircle status="OK" />
			<StatusCircle status="MISSING" />
			<StatusCircle status="WAIT" />
		</div>
	</FriendCodeGate></Main
>

<style>
	div {
		position: relative;
	}
</style>
