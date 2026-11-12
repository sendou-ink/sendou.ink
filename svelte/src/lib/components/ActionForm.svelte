<script
	lang="ts"
	generics="Input extends Record<string, string | number>, Output extends { toast?: string } | void"
>
import { isHttpError } from "@sveltejs/kit";
import type {
	RemoteForm,
	RemoteQueryFunction,
	RemoteQueryUpdate,
} from "$app/server";
import { m } from "#lib/paraglide/messages.js";
import { trackMutation } from "#lib/pending-mutations.svelte.ts";
import Button, { type ButtonLookProps } from "./Button.svelte";
import Dialog from "./Dialog.svelte";
import { errorToast, successToast } from "./toast-queue.svelte.ts";

type Props = Omit<ButtonLookProps, "testId"> & {
	/** Remote form the button submits, `.for(key)` instance when it is rendered more than once. */
	form: Omit<RemoteForm<Input, Output>, "for">;
	/** Submitted as hidden inputs, type checked against the form's schema. */
	fields: Input;
	/** Queries the server may refresh in the mutation's own response, on top of the ones it always does. */
	updates?: Array<RemoteQueryFunction<any, any> | RemoteQueryUpdate>;
	/** Submits only after the user confirms via a dialog. */
	confirm?: {
		dialogHeading: string;
		submitButtonText?: string;
	};
	testId?: string;
	"aria-label"?: string;
};

let {
	form,
	fields,
	updates = [],
	confirm,
	testId,
	"aria-label": ariaLabel,
	icon,
	children,
	...buttonLook
}: Props = $props();

let isConfirmOpen = $state(false);

const enhanced = $derived(
	form.enhance(async (submission) => {
		isConfirmOpen = false;

		try {
			await trackMutation(() => submission.submit().updates(...updates));

			const toast = submission.result?.toast;
			if (toast) successToast(toast);
		} catch (error) {
			errorToast(
				isHttpError(error) ? error.body.message : "Something went wrong",
			);
		}
	}),
);
</script>

{#snippet hiddenFields()}
	{#each Object.entries(fields) as [name, value] (name)}
		<input {...(form.fields as any)[name].as("hidden", value)} />
	{/each}
{/snippet}

{#if confirm}
	<Button
		{...buttonLook}
		{icon}
		{children}
		{testId}
		aria-label={ariaLabel}
		onclick={() => {
			isConfirmOpen = true;
		}}
	/>
	{#if isConfirmOpen}
		<Dialog
			isDismissable
			onClose={() => {
				isConfirmOpen = false;
			}}
		>
			<form {...enhanced} class="stack md">
				{@render hiddenFields()}
				<h2 class="text-md text-center">{confirm.dialogHeading}</h2>
				<div class="stack horizontal md justify-center mt-2">
					<Button
						type="submit"
						variant="destructive"
						testId="confirm-button"
						isPending={form.pending > 0}
					>
						{confirm.submitButtonText ?? m.common_actions_delete()}
					</Button>
				</div>
			</form>
		</Dialog>
	{/if}
{:else}
	<form {...enhanced}>
		{@render hiddenFields()}
		<Button
			{...buttonLook}
			{icon}
			{children}
			type="submit"
			testId={testId ?? "submit-button"}
			aria-label={ariaLabel}
			isPending={form.pending > 0}
		/>
	</form>
{/if}
