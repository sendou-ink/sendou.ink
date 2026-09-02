/**
 * Analyzed-frame preview in an event card's meta row; clicking opens the
 * frame big in a dialog (the exact lossless frame once its lazy loader
 * resolves, the thumbnail until then) with the Inspect / Save fixture actions.
 */

import { ExternalLink, FlaskConical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import styles from "./FrameThumb.module.css";
import { type FixtureData, saveFixtureFromEvent } from "./fixture-export";

export function FrameThumb({
	thumbnail,
	getFrame,
	onInspect,
	fixture,
}: {
	thumbnail?: string;
	getFrame?: () => Promise<Blob | null | undefined>;
	/** opens the frame in the screenshot page in a new browser tab */
	onInspect?: () => void;
	/** enables Save fixture: the event's payload and fixture type label */
	fixture?: { data: FixtureData; type: string };
}) {
	const [open, setOpen] = useState(false);
	const [frameUrl, setFrameUrl] = useState<string | null>(null);
	const frameUrlRef = useRef<string | null>(null);

	useEffect(
		() => () => {
			if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
		},
		[],
	);

	if (!thumbnail) return null;

	const show = () => {
		setOpen(true);
		if (!getFrame || frameUrlRef.current) return;
		void getFrame().then((frame) => {
			if (!frame || frameUrlRef.current) return;
			frameUrlRef.current = URL.createObjectURL(frame);
			setFrameUrl(frameUrlRef.current);
		});
	};

	const onSaveFixture =
		getFrame && fixture
			? () =>
					void getFrame().then(
						(frame) =>
							frame && saveFixtureFromEvent(frame, fixture.data, fixture.type),
					)
			: undefined;

	return (
		<>
			<button
				type="button"
				className={styles.thumbButton}
				title="View frame"
				onClick={show}
			>
				<img className={styles.thumb} src={thumbnail} alt="analyzed frame" />
			</button>
			{open ? (
				<SendouDialog
					isDismissable
					aria-label="Analyzed frame"
					className={styles.dialog}
					onClose={() => setOpen(false)}
				>
					<img
						className={styles.frameFull}
						src={frameUrl ?? thumbnail}
						alt="analyzed frame"
					/>
					{onInspect || onSaveFixture ? (
						<div className={styles.frameActions}>
							{onInspect ? (
								<SendouButton
									size="small"
									icon={<ExternalLink />}
									onPress={onInspect}
								>
									Inspect
								</SendouButton>
							) : null}
							{onSaveFixture ? (
								<SendouButton
									size="small"
									variant="outlined"
									icon={<FlaskConical />}
									onPress={onSaveFixture}
								>
									Save fixture
								</SendouButton>
							) : null}
						</div>
					) : null}
				</SendouDialog>
			) : null}
		</>
	);
}
