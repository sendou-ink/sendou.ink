<script lang="ts">
	import * as TeamAPI from '$lib/api/team';
	import Main from '$lib/components/layout/Main.svelte';
	import type { Snippet } from 'svelte';
	import type { PageProps } from './$types';
	import TeamBanner from './TeamBanner.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { userSubmittedImage } from '$lib/utils/urls-img';

	interface Props extends PageProps {
		children: Snippet;
	}

	let { params, children }: Props = $props();

	const { team } = $derived(await TeamAPI.queries.bySlug(params.slug));
</script>

<OpenGraphMeta
	title={team.name}
	description={team.bio}
	image={team.avatarSrc
		? {
				url: userSubmittedImage(team.avatarSrc),
				dimensions: {
					width: 124,
					height: 124
				}
			}
		: undefined}
/>

<Main class="stack sm">
	<TeamBanner {team} />
	{@render children()}
</Main>
