import * as React from "react";
import { useLatestRef } from "~/hooks/useLatestRef";
import { useStreamDeck } from "../hooks";
import * as StreamDeck from "../stream-deck";

/**
 * Shows `faces` on the connected Stream Deck's keys (from the top left, row by row, {@link StreamDeck.COLUMNS}
 * per row) as they change and calls `onPress` with the index of a key pressed, unless it is disabled. Renders
 * nothing visible and does nothing while no deck is connected. Mount one at a time: the keys go blank once it
 * unmounts.
 */
export function StreamDeckKeys({
	faces,
	onPress,
}: {
	faces: StreamDeck.KeyFace[];
	onPress: (keyIndex: number) => void;
}) {
	const { connection } = useStreamDeck();

	if (!connection) return null;

	return (
		<ConnectedKeys connection={connection} faces={faces} onPress={onPress} />
	);
}

function ConnectedKeys({
	connection,
	faces,
	onPress,
}: {
	connection: StreamDeck.Connection;
	faces: StreamDeck.KeyFace[];
	onPress: (keyIndex: number) => void;
}) {
	const iconsRef = React.useRef<HTMLDivElement>(null);
	const drawn = React.useRef<{
		connection: StreamDeck.Connection;
		faces: Map<number, string>;
	} | null>(null);
	const drawQueue = React.useRef<Promise<unknown>>(Promise.resolve());
	const mountedConnection = React.useRef<StreamDeck.Connection | null>(null);
	const latest = useLatestRef({ faces, onPress });

	React.useEffect(() => {
		mountedConnection.current = connection;

		return () => {
			mountedConnection.current = null;
			void StreamDeck.clearKeys(connection);
		};
	}, [connection]);

	// every render, only the keys that look different are drawn again
	React.useEffect(() => {
		if (drawn.current?.connection !== connection) {
			drawn.current = { connection, faces: new Map() };
		}
		const drawnFaces = drawn.current.faces;

		for (const [idx, face] of faces.entries()) {
			const iconSvg = iconsRef.current?.querySelector(
				`[data-key="${idx}"]`,
			)?.outerHTML;
			if (!iconSvg) continue;

			const signature = JSON.stringify({ ...face, iconSvg });
			if (drawnFaces.get(idx) === signature) continue;
			drawnFaces.set(idx, signature);

			drawQueue.current = drawQueue.current
				.then(() => StreamDeck.drawKey(face, iconSvg))
				.then(async (canvas) => {
					if (mountedConnection.current !== connection) return;

					await StreamDeck.fillKey(connection, idx, canvas);
					StreamDeck.reportDrawFailed(null);
				})
				.catch((error: unknown) => {
					// drawn again on the next render
					if (drawnFaces.get(idx) === signature) drawnFaces.delete(idx);
					StreamDeck.reportDrawFailed(
						error instanceof Error ? error.message : String(error),
					);
				});
		}
	});

	React.useEffect(() => {
		const onDown = (control: { type: string; row: number; column: number }) => {
			if (control.type !== "button") return;

			const keyIndex = control.row * StreamDeck.COLUMNS + control.column;
			const face = latest.current.faces[keyIndex];
			if (face && !face.isDisabled) latest.current.onPress(keyIndex);
		};

		connection.deck.on("down", onDown);
		return () => {
			connection.deck.off("down", onDown);
		};
	}, [connection, latest]);

	return (
		<div ref={iconsRef} hidden>
			{faces.map((face, idx) => (
				<face.icon key={idx} data-key={idx} color="#ffffff" size={28} />
			))}
		</div>
	);
}
