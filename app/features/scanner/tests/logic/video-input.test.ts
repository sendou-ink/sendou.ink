import { describe, expect, test } from "vitest";
import { resolveVideoInput } from "../../capture/sampler";

const WEBCAM = { deviceId: "webcam", label: "FaceTime HD Camera" };
const ELGATO = { deviceId: "elgato", label: "Game Capture HD60 S+" };
const CAM_LINK = { deviceId: "camlink", label: "Cam Link 4K (0fd9:0066)" };
const DONGLE = { deviceId: "dongle", label: "USB Video" };
const OBS = { deviceId: "obs", label: "OBS Virtual Camera" };
const ANONYMOUS = { deviceId: "", label: "" };

describe("resolveVideoInput", () => {
	test.each([
		{
			why: "saved webcam",
			inputs: [ELGATO, WEBCAM],
			saved: "webcam",
			expected: WEBCAM,
		},
		{
			why: "unplugged saved device",
			inputs: [WEBCAM, CAM_LINK],
			saved: "gone",
			expected: CAM_LINK,
		},
		{
			why: "capture card over webcam",
			inputs: [WEBCAM, ELGATO],
			saved: "",
			expected: ELGATO,
		},
		{
			why: "generic capture dongle",
			inputs: [WEBCAM, DONGLE],
			saved: "",
			expected: DONGLE,
		},
		{
			why: "capture card over OBS",
			inputs: [OBS, ELGATO],
			saved: "",
			expected: ELGATO,
		},
		{ why: "OBS over webcam", inputs: [WEBCAM, OBS], saved: "", expected: OBS },
		{ why: "only a webcam", inputs: [WEBCAM], saved: "", expected: null },
		{ why: "anonymous list", inputs: [ANONYMOUS], saved: "", expected: null },
	])("$why", ({ inputs, saved, expected }) => {
		expect(resolveVideoInput(inputs, saved)).toEqual(expected);
	});
});
