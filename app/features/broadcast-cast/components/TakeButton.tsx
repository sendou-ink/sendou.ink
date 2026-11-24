import { ChevronsLeft } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { BROADCAST_TAKE_AFTER_AUTO_TAKE_MS } from "~/features/broadcast/broadcast-constants";
import { broadcastActionSchema } from "../broadcast-cast-schemas";
import type { CastBroadcastState } from "../broadcast-cast-types";

/**
 * Puts Next on air. A held key takes only once, and a press right after Next went on air by itself or by another
 * producer is ignored, as it was meant for what is on air now and would take what came after it.
 */
export function TakeButton({
	state,
	canTake,
	clockOffsetMs,
	className,
	formClassName,
}: {
	state: CastBroadcastState;
	canTake: boolean;
	/** Server clock minus this browser's. */
	clockOffsetMs: number;
	className?: string;
	formClassName?: string;
}) {
	const { t } = useTranslation(["broadcast"]);
	// the takeId this dashboard's last press would make, so a Take from elsewhere is told apart
	const [ownTakeId, setOwnTakeId] = React.useState<number | null>(null);

	// an automatic Take is never this dashboard's, even one landing as its own press was refused
	const isTakenElsewhere =
		state.takenBy !== "producer" || state.takeId !== ownTakeId;

	return (
		<ActionButton
			schema={broadcastActionSchema}
			action="TAKE"
			fields={{
				takeId: state.takeId,
				matchId: state.match?.id,
				resultCount: state.match?.progress.next.resultCount,
			}}
			size="big"
			icon={<ChevronsLeft />}
			isDisabled={!canTake}
			className={className}
			formClassName={formClassName}
			testId="broadcast-take-button"
			onKeyDown={(event) => {
				if (event.repeat) event.preventDefault();
			}}
			onClick={(event) => {
				const serverNow = Date.now() + clockOffsetMs;
				if (
					isTakenElsewhere &&
					state.takenAt !== null &&
					serverNow - state.takenAt < BROADCAST_TAKE_AFTER_AUTO_TAKE_MS
				) {
					event.preventDefault();
					return;
				}

				setOwnTakeId(state.takeId + 1);
			}}
		>
			{t("broadcast:dashboard.take")}
		</ActionButton>
	);
}
