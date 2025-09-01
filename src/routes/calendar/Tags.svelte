<script lang="ts">
	import type { CalendarEventTag } from '$lib/server/db/tables';

	interface Props {
		tags: Array<CalendarEventTag>;
		// small?: boolean;
		// centered?: boolean;

		// /** Called when tag delete button clicked. If undefined delete buttons won't be shown. */
		// onDelete?: (tag: CalendarEventTag) => void;
	}

	const { tags }: Props = $props();
</script>

xxx: {tags.join(',')}
