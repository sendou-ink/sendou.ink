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
 * Reloads when the server reports a different build than this client's JS, since long-open revalidating
 * pages (SendouQ looking above all) would otherwise run old code against new loader data.
 */
export function useReloadOnNewDeploy(serverCommit: string) {
	React.useEffect(() => {
		if (!GIT_COMMIT || !serverCommit || serverCommit === GIT_COMMIT) return;

		// the same build is never retried, so a reload not serving the new bundle can't loop
		if (PersistedState.read(reloadedForCommitPersisted) === serverCommit) {
			return;
		}

		PersistedState.write(reloadedForCommitPersisted, serverCommit);
		window.location.reload();
	}, [serverCommit]);
}
