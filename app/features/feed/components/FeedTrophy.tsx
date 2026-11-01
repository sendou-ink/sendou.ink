import * as React from "react";
import { Trophy } from "~/features/trophies/components/Trophy";
import { TrophyShowcaseModal } from "~/features/trophies/components/TrophyShowcase";
import styles from "./FeedTrophy.module.css";

/** A won trophy that opens big when clicked. */
export function FeedTrophy({
	trophy,
	tier,
}: {
	trophy: { id: number; name: string; model: string; code: string | null };
	tier: number | null;
}) {
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<>
			<button
				type="button"
				className={styles.button}
				onClick={() => setIsOpen(true)}
				aria-label={trophy.name}
			>
				<Trophy
					model={trophy.model}
					code={trophy.code}
					tier={tier}
					paused={isOpen}
					staticOnSoftwareRendering
					disableCameraControls
					fps={30}
				/>
			</button>
			{isOpen ? (
				<TrophyShowcaseModal trophy={trophy} onClose={() => setIsOpen(false)} />
			) : null}
		</>
	);
}
