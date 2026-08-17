<!--
@component
Renders a `<time>` element with the given date formatted according to the user's
locale preferences.

During SSR the formatted text is hidden (via `invisible`) while still reserving
one line of height to avoid layout shift on hydration. The `datetime` attribute
is always set to the ISO string for machine readability and a11y.
-->
<script lang="ts">
import { dateTimeFormat } from "#lib/modules/intl/date-time-format.ts";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";

interface Props {
	/** The date to render. Accepts a `Date` or a database timestamp (number), which is converted via `databaseTimestampToDate`. */
	date: Date | number;
	/** Formatting options forwarded to `Intl.DateTimeFormat`. Combined with the user's locale and hour cycle preferences. */
	options: Intl.DateTimeFormatOptions;
	/** Optional extra class names appended to the rendered `<time>` element. */
	class?: string;
	/** When `true`, renders inline; otherwise the element is displayed as a block. Defaults to block. */
	inline?: boolean;
	/** Optional test id forwarded to the rendered `<time>` element. */
	testId?: string;
}

let { date, options, class: className, inline, testId }: Props = $props();

const formatting = $derived(dateTimeFormat(options));
const dateObject = $derived(
	typeof date === "number" ? databaseTimestampToDate(date) : date,
);
</script>

<time
	data-testid={testId}
	datetime={dateObject.toISOString()}
	class={[{ block: !inline, invisible: !formatting.isLoaded }, className]}
	>{formatting.formatter.format(dateObject)}</time
>
