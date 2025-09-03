<script lang="ts">
	import type { CalendarEventTag } from '$lib/server/db/tables';
	import { tags as allTags } from '$lib/constants/calendar';
	import { calendarEventTagTranslations } from '$lib/utils/i18n';

	interface Props {
		tags: Array<CalendarEventTag>;
		small?: boolean;
		centered?: boolean;
	}

	const { tags, small, centered }: Props = $props();
</script>

{#if tags.length > 0}
	<ul class={['tags', { small, centered }]}>
		{#each tags as tag (tag)}
			<li style="background-color: {allTags[tag].color}">
				{calendarEventTagTranslations[tag]()}
			</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		display: flex;
		max-width: var(--tags-max-width, 18rem);
		flex-wrap: wrap;
		padding: 0;
		font-size: var(--fonts-xxs);
		font-weight: var(--semi-bold);
		gap: var(--s-1);
		list-style: none;

		& > li {
			display: flex;
			align-items: center;
			border-radius: var(--radius-field);
			padding-inline: var(--s-1-5);
			min-height: 20px;
			color: #000;
		}
	}

	.small {
		font-size: var(--fonts-xxxs);
	}

	.centered {
		justify-content: center;

		& > li {
			padding: 0 var(--s-1);
		}
	}
</style>
