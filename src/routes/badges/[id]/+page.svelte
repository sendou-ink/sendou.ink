<script>
	import { badgeOwners } from './queries/badge-owners.remote';
	import { page } from '$app/state';
</script>

<pre>
  {JSON.stringify(await badgeOwners(Number(page.params.id)), null, 2)}
</pre>
