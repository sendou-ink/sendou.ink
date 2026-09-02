import * as React from "react";
import { useTranslation } from "react-i18next";
import { type Location, useBlocker } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";

/** In-app navigations pass the locations so same-route ones can be ignored; a page unload passes nothing. */
type UnsavedChangesChecker = (navigation?: {
	currentLocation: Location;
	nextLocation: Location;
}) => boolean;

const dirtyCheckers = new Set<UnsavedChangesChecker>();

/** Rendered once in root since react-router allows one active blocker; forms register via `useUnsavedChangesChecker`. */
export function UnsavedChangesGuard() {
	const { t } = useTranslation(["common", "forms"]);

	const blocker = useBlocker(
		({ currentLocation, nextLocation }) =>
			(currentLocation.pathname !== nextLocation.pathname ||
				currentLocation.search !== nextLocation.search) &&
			hasUnsavedChanges({ currentLocation, nextLocation }),
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

/** Registers a dirty checker; the ref lets it read the latest state without re-registering every render. */
export function useUnsavedChangesChecker(
	checkerRef: React.RefObject<UnsavedChangesChecker>,
) {
	React.useEffect(() => {
		const checker: UnsavedChangesChecker = (navigation) =>
			checkerRef.current(navigation);
		dirtyCheckers.add(checker);
		return () => {
			dirtyCheckers.delete(checker);
		};
	}, [checkerRef]);
}

function hasUnsavedChanges(navigation?: Parameters<UnsavedChangesChecker>[0]) {
	for (const checker of dirtyCheckers) {
		if (checker(navigation)) return true;
	}
	return false;
}
