<script lang="ts">
import { Button, Dialog } from "@sendou/components";
import { m } from "#lib/paraglide/messages.js";
import { beforeNavigate, goto } from "$app/navigation";
import { hasUnsavedChanges } from "./unsaved-changes.ts";

/**
 * Confirms navigating away when any mounted form has unsaved changes.
 * Rendered once in the root layout; individual forms register a dirty checker
 * via `registerDirtyChecker` instead of wiring navigation blocking themselves.
 */

let pendingUrl = $state<URL | null>(null);
// checkers stay registered until their form unmounts on the navigation, so a
// deliberate leave has to bypass the guard for its own goto
let bypass = false;

beforeNavigate((navigation) => {
	if (bypass || !hasUnsavedChanges()) return;

	if (navigation.willUnload) {
		// cancelling a document-unload navigation triggers the browser's own
		// confirmation dialog
		navigation.cancel();
		return;
	}

	navigation.cancel();
	if (!pendingUrl) {
		pendingUrl = navigation.to?.url ?? null;
	}
});

function stay() {
	pendingUrl = null;
}

function discardAndLeave() {
	const target = pendingUrl;
	pendingUrl = null;
	if (!target) return;

	bypass = true;
	void goto(target).finally(() => {
		bypass = false;
	});
}
</script>

{#if pendingUrl}
	<Dialog
		heading={m.forms_unsavedChanges_title()}
		onClose={stay}
		isDismissable
	>
		<div class="stack md text-sm text-lighter">
			{m.forms_unsavedChanges_body()}
			<div class="stack horizontal md justify-center">
				<Button variant="outlined" onclick={stay}>
					{m.common_actions_cancel()}
				</Button>
				<Button
					variant="destructive"
					onclick={discardAndLeave}
					testId="discard-changes-button"
				>
					{m.forms_unsavedChanges_discard()}
				</Button>
			</div>
		</div>
	</Dialog>
{/if}
