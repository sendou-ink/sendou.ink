import * as React from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";

const dirtyCheckers = new Set<() => boolean>();

/**
 * Confirms navigating away when any mounted form has unsaved changes.
 * Rendered once in the root layout because react-router supports only a
 * single active blocker at a time — individual forms register a checker via
 * `useUnsavedChangesChecker` instead of calling `useBlocker` themselves.
 */
export function UnsavedChangesGuard() {
	const { t } = useTranslation(["common", "forms"]);

	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			(currentLocation.pathname !== nextLocation.pathname ||
				currentLocation.search !== nextLocation.search) &&
			hasUnsavedChanges(),
	);

	React.useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!hasUnsavedChanges()) return;
			event.preventDefault();
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, []);

	if (blocker.state !== "blocked") return null;

	return (
		<SendouDialog
			heading={t("forms:unsavedChanges.title")}
			onClose={() => blocker.reset()}
			isDismissable
		>
			<div className="stack md stack md text-sm text-lighter">
				{t("forms:unsavedChanges.body")}
				<div className="stack horizontal md justify-center">
					<SendouButton variant="outlined" onPress={() => blocker.reset()}>
						{t("common:actions.cancel")}
					</SendouButton>
					<SendouButton
						variant="destructive"
						onPress={() => blocker.proceed()}
						data-testid="discard-changes-button"
					>
						{t("forms:unsavedChanges.discard")}
					</SendouButton>
				</div>
			</div>
		</SendouDialog>
	);
}

/**
 * Registers a callback reporting whether the calling form currently has
 * unsaved changes. The ref indirection lets the callback read the latest
 * form state without re-registering on every render.
 */
export function useUnsavedChangesChecker(
	checkerRef: React.RefObject<() => boolean>,
) {
	React.useEffect(() => {
		const checker = () => checkerRef.current();
		dirtyCheckers.add(checker);
		return () => {
			dirtyCheckers.delete(checker);
		};
	}, [checkerRef]);
}

function hasUnsavedChanges() {
	for (const checker of dirtyCheckers) {
		if (checker()) return true;
	}
	return false;
}
