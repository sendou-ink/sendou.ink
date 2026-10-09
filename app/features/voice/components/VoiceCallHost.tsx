import * as React from "react";
import { voiceClient } from "../voice-client";
import { useVoiceSnapshot } from "../voice-hooks";

const VoiceCall = React.lazy(() =>
	import("./VoiceCall").then((module) => ({ default: module.VoiceCall })),
);

export function VoiceCallHost() {
	const { call } = useVoiceSnapshot();

	React.useEffect(() => voiceClient.start(), []);

	React.useEffect(() => {
		const handlePageHide = () => voiceClient.leaveOnPageClose();

		window.addEventListener("pagehide", handlePageHide);
		return () => window.removeEventListener("pagehide", handlePageHide);
	}, []);

	if (!call?.credentials || !call.voiceSessionId) return null;

	return (
		<React.Suspense fallback={null}>
			<VoiceCall
				key={call.voiceSessionId}
				roomId={call.roomId}
				roomUrl={call.credentials.roomUrl}
				token={call.credentials.token}
			/>
		</React.Suspense>
	);
}
