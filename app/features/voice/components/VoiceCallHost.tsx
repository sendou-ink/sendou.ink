import * as React from "react";
import { useUser } from "~/features/auth/core/user";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { voiceClient } from "../voice-client";
import { useVoiceSnapshot } from "../voice-hooks";

const VoiceCall = React.lazy(() =>
	IS_E2E_TEST_RUN
		? import("./FakeVoiceCall").then((module) => ({
				default: module.FakeVoiceCall,
			}))
		: import("./VoiceCall").then((module) => ({ default: module.VoiceCall })),
);

export function VoiceCallHost() {
	const { call } = useVoiceSnapshot();
	const user = useUser();
	const inputMode = user?.preferences.voicePushToTalk
		? "PUSH_TO_TALK"
		: "OPEN_MIC";

	React.useEffect(() => voiceClient.start(), []);

	React.useEffect(() => voiceClient.setInputMode(inputMode), [inputMode]);

	React.useEffect(() => {
		const handlePageHide = () => voiceClient.leaveOnPageClose();

		window.addEventListener("pagehide", handlePageHide);
		return () => window.removeEventListener("pagehide", handlePageHide);
	}, []);

	React.useEffect(() => void voiceClient.rejoinAfterReload(), []);

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
