<!--
@component
A time rendered as a button that opens a popover with the full date/time
(including time zone) and a shortcut for copying a Discord timestamp code.
-->
<script lang="ts">
import { Check, Clipboard } from "@lucide/svelte";
import { Button, Popover } from "@sendou/components";
import LocaleTime from "#lib/components/LocaleTime.svelte";
import { m } from "#lib/paraglide/messages.js";

const COPY_SUCCESS_DURATION_MS = 2000;

interface Props {
	date: Date;
	options?: Intl.DateTimeFormatOptions;
	underline?: boolean;
	class?: string;
	footerText?: string;
}

let {
	date,
	options = {
		minute: "numeric",
		hour: "numeric",
		day: "numeric",
		month: "numeric",
	},
	underline = true,
	class: className,
	footerText,
}: Props = $props();

let copySuccess = $state(false);
let copyResetTimeout: ReturnType<typeof setTimeout> | undefined;

function copyTimestampForDiscord() {
	navigator.clipboard.writeText(`<t:${date.valueOf() / 1000}:F>`).then(
		() => {
			copySuccess = true;
			clearTimeout(copyResetTimeout);
			copyResetTimeout = setTimeout(() => {
				copySuccess = false;
			}, COPY_SUCCESS_DURATION_MS);
		},
		() => {},
	);
}
</script>

<div>
	<Popover>
		{#snippet trigger(triggerProps)}
			<button
				type="button"
				class={[className, "clickable", "textOnlyButton", { dotted: underline }]}
				{...triggerProps}
			>
				<LocaleTime {date} {options} inline />
			</button>
		{/snippet}
		<div class="stack sm">
			<div class="text-center">
				<LocaleTime
					{date}
					options={{
						timeZoneName: "long",
						hour: "numeric",
						minute: "numeric",
					}}
				/>
			</div>
			<Button size="miniscule" variant="minimal" onclick={copyTimestampForDiscord}>
				{#snippet icon()}
					{#if copySuccess}<Check />{:else}<Clipboard />{/if}
				{/snippet}
				{m.common_actions_copyTimestampForDiscord()}
			</Button>
			{#if footerText}
				<div class="text-lighter text-center mt-2 text-xs">
					{footerText}
				</div>
			{/if}
		</div>
	</Popover>
</div>

<style>
	.textOnlyButton {
		cursor: pointer;
		border: 0;
		background-color: inherit;
		color: inherit;
		margin: 0;
		padding: 0;
	}

	.dotted {
		text-decoration-style: dotted;
		text-decoration-line: underline;
		text-decoration-thickness: 2px;
	}
</style>
