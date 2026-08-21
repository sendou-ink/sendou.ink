import * as React from "react";
import * as v from "valibot";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { GIT_COMMIT } from "~/utils/git-commit";

const reloadedForCommitPersisted = PersistedState.define({
	key: "reloadedForCommit",
	storage: "session",
	schema: v.string(),
	default: "",
});

/**
 * Reloads the page when the server starts reporting a different build than the
 * one this client's JavaScript was loaded from. Pages that stay open for hours
 * while revalidating (SendouQ looking above all) otherwise keep running old
 * code against new loader data, breaking whenever a deploy changes the shape of
 * that data.
 */
export function useReloadOnNewDeploy(serverCommit: string) {
	React.useEffect(() => {
		if (!GIT_COMMIT || !serverCommit || serverCommit === GIT_COMMIT) return;

		// the reload is expected to serve the new bundle, but should it not, the
		// same build is never retried so the page can't end up in a reload loop
		if (PersistedState.read(reloadedForCommitPersisted) === serverCommit) {
			return;
		}

		PersistedState.write(reloadedForCommitPersisted, serverCommit);
		window.location.reload();
	}, [serverCommit]);
}
