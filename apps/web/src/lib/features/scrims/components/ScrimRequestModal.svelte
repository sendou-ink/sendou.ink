<script lang="ts">
import { Dialog } from "@sendou/components";
import * as v from "valibot";
import Divider from "#lib/components/Divider.svelte";
import FormMessage from "#lib/components/FormMessage.svelte";
import FormField from "#lib/form/FormField.svelte";
import SendouForm from "#lib/form/SendouForm.svelte";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import type { CommonUser } from "#lib/server/kysely.ts";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { SCRIM } from "../scrims-constants.ts";
import { getScrimPosts, newScrimRequest } from "../scrims.remote.ts";
import { type newRequestSchema, scrimRequestFormSchema } from "../scrims-schemas.ts";
import type { ScrimPost } from "../scrims-types.ts";
import { generateTimeOptions } from "../scrims-utils.ts";
import WithFormField from "./WithFormField.svelte";

interface Props {
	post: ScrimPost;
	teams: Array<{ id: number; name: string; members: Array<CommonUser> }>;
	close: () => void;
}

let { post, teams, close }: Props = $props();

const timeFormatter = new Intl.DateTimeFormat(getLocale(), {
	hour: "numeric",
	minute: "numeric",
});

// svelte-ignore state_referenced_locally -- the modal is remounted per open, the post can't change under it
const timeOptions = post.rangeEndsAt
	? generateTimeOptions(
			databaseTimestampToDate(post.startsAt),
			databaseTimestampToDate(post.rangeEndsAt),
		).map((timestamp) => ({
			value: String(timestamp),
			label: timeFormatter.format(new Date(timestamp)),
		}))
	: [];

function nullFilledArray(length: number) {
	return Array.from({ length }, () => null);
}

async function handleSubmit(values: Record<string, unknown>) {
	const result = await newScrimRequest(
		values as v.InferInput<typeof newRequestSchema>,
	).updates(getScrimPosts);

	if (result?.fieldErrors) {
		return {
			fieldErrors: result.fieldErrors as unknown as Record<string, string>,
		};
	}
	return undefined;
}
</script>

<Dialog heading={m.scrims_requestModal_title()} onClose={close}>
	<SendouForm
		schema={scrimRequestFormSchema}
		defaultValues={{
			scrimPostId: post.id,
			from:
				teams.length > 0
					? { mode: "TEAM", teamId: teams[0].id }
					: {
							mode: "PICKUP",
							users: nullFilledArray(
								SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER,
							) as unknown as number[],
						},
			message: "",
			at: post.rangeEndsAt && timeOptions[0] ? timeOptions[0].value : null,
		}}
		onSubmit={handleSubmit}
		onSuccess={close}
	>
		<div class="font-semi-bold text-lighter italic">
			{new Intl.ListFormat(getLocale()).format(
				post.users.map((u) => u.username),
			)}
		</div>
		{#if post.text}
			<div class="text-sm text-lighter italic">{post.text}</div>
		{/if}
		<Divider />
		<FormField name="from">
			{#snippet children(props)}
				<WithFormField usersTeams={teams} {...props} />
			{/snippet}
		</FormField>
		{#if post.rangeEndsAt}
			<FormField name="at" options={timeOptions} />
		{/if}
		<FormField name="message" />
		<FormMessage type="info">{m.scrims_autoCancelInfo()}</FormMessage>
	</SendouForm>
</Dialog>
