<script lang="ts">
	import { page } from '$app/state';
	import Main from '$lib/components/layout/Main.svelte';
</script>

<!-- xxx: translate -->
<Main>
	{#if page.status === 404}
		{@render notFound()}
	{:else if page.status === 401}
		{@render authenticationRequired()}
	{:else if page.status === 403}
		{@render unauthorized()}
	{/if}
</Main>

{#snippet notFound()}
	<h2>Error {page.status} - Page not found</h2>
	{@render getHelp()}
{/snippet}

{#snippet authenticationRequired()}
	<h2>Error {page.status} - Authentication required</h2>
	<p>This page requires you to be logged in.</p>
	<!-- xxx: login button here -->
	{@render getHelp()}
{/snippet}

{#snippet unauthorized()}
	<h2>Error {page.status} - Unauthorized</h2>
	<p>Your account doesn't have the required permissions to perform this action.</p>
	{@render getHelp()}
{/snippet}

{#snippet getHelp()}
	<p class="mt-2">
		If you need assistance you can ask for help on
		<a href="https://discord.gg/sendou">our Discord</a>
	</p>
{/snippet}

<style>
	a {
		color: var(--color-primary);
	}
</style>
