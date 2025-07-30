<script>
	import { badgeOwners } from './badge-owners.remote';

	let { params } = $props();
</script>

<pre>
  {JSON.stringify(await badgeOwners(Number(params.id)), null, 2)}
</pre>
