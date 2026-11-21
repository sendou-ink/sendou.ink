import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { BroadcastObsAudioContext } from "~/features/broadcast/broadcast-obs-audio-context";
import type { BroadcastObsAudio } from "~/features/broadcast/broadcast-types";
import type { BroadcastSceneLayer } from "~/features/broadcast/components/BroadcastOverlay";
import { DEFAULT_CAST_BROADCAST_SETTINGS } from "../broadcast-cast-constants";
import type { CastBroadcastState, CastScene } from "../broadcast-cast-types";
import * as DesignScenario from "../core/DesignScenario";
import { CAST_SCENE_SET } from "./CastScene";

const connections = vi.hoisted(
	() =>
		[] as Array<{
			port: number;
			password: string | null;
			onIdentified: () => void;
			requests: Array<{ requestType: string; requestData: unknown }>;
			close: ReturnType<typeof vi.fn>;
		}>,
);

vi.mock("~/features/broadcast/core/ObsWebSocket", () => ({
	connect: (args: {
		port: number;
		password: string | null;
		onIdentified: () => void;
	}) => {
		const connection = {
			...args,
			requests: [] as Array<{ requestType: string; requestData: unknown }>,
			close: vi.fn(),
		};
		connections.push(connection);

		return {
			request: (requestType: string, requestData: unknown) =>
				connection.requests.push({ requestType, requestData }),
			close: connection.close,
		};
	},
}));

const OBS_AUDIO: BroadcastObsAudio = {
	inputName: "Capture Card",
	port: 4455,
	password: "pw",
};

const Underlay = CAST_SCENE_SET.Underlay!;

const lastConnection = () => connections.at(-1)!;
const lastMute = () =>
	(
		lastConnection().requests.at(-1)?.requestData as
			| { inputName: string; inputMuted: boolean }
			| undefined
	)?.inputMuted;

beforeEach(() => {
	connections.length = 0;
});

describe("CastUnderlay", () => {
	test("connects to OBS with the OBS URL's port and password", async () => {
		await renderUnderlay({ layers: [layer("game")] });

		expect(connections).toHaveLength(1);
		expect(lastConnection()).toMatchObject({ port: 4455, password: "pw" });
	});

	test.each([
		{ scene: "game", isMuted: false },
		{ scene: "casters", isMuted: true },
		{ scene: "results", isMuted: true },
		{ scene: "replays", isMuted: true },
		{ scene: "break", isMuted: true },
	] as const)(
		"mutes the capture card once identified on $scene: $isMuted",
		async ({ scene, isMuted }) => {
			await renderUnderlay({ layers: [layer(scene)] });

			lastConnection().onIdentified();

			expect(lastConnection().requests.at(-1)).toEqual({
				requestType: "SetInputMute",
				requestData: { inputName: "Capture Card", inputMuted: isMuted },
			});
		},
	);

	test("goes by the scene coming in, not the one fading out", async () => {
		await renderUnderlay({
			layers: [layer("game", "in"), layer("casters", "out")],
		});

		lastConnection().onIdentified();

		expect(lastMute()).toBe(false);
	});

	test("mutes and unmutes as the scene on screen changes", async () => {
		const screen = await renderUnderlay({ layers: [layer("game")] });

		await screen.rerender(underlay({ layers: [layer("casters")] }));
		expect(lastMute()).toBe(true);

		await screen.rerender(underlay({ layers: [layer("game")] }));
		expect(lastMute()).toBe(false);
	});

	test("sends the scene on screen now after connecting again", async () => {
		const screen = await renderUnderlay({ layers: [layer("game")] });
		await screen.rerender(underlay({ layers: [layer("casters")] }));

		lastConnection().onIdentified();

		expect(lastMute()).toBe(true);
	});

	test("unmutes and disconnects once the setting is turned off", async () => {
		const screen = await renderUnderlay({ layers: [layer("casters")] });
		const connection = lastConnection();

		await screen.rerender(
			underlay({ layers: [layer("casters")], obsAudio: null }),
		);

		expect(lastMute()).toBe(false);
		expect(connection.close).toHaveBeenCalledOnce();
		expect(connections).toHaveLength(1);
	});

	test("doesn't connect without the OBS URL's setting, e.g. on the dashboard's previews", async () => {
		await renderUnderlay({ layers: [layer("casters")], obsAudio: null });

		expect(connections).toHaveLength(0);
	});
});

function renderUnderlay(args: Parameters<typeof underlay>[0]) {
	return render(underlay(args));
}

function underlay({
	layers,
	obsAudio = OBS_AUDIO,
}: {
	layers: BroadcastSceneLayer<CastBroadcastState>[];
	obsAudio?: BroadcastObsAudio | null;
}) {
	return (
		<BroadcastObsAudioContext.Provider value={obsAudio}>
			<Underlay state={layers[0].state} view="live" layers={layers} />
		</BroadcastObsAudioContext.Provider>
	);
}

function layer(
	scene: CastScene,
	transition?: "in" | "out",
): BroadcastSceneLayer<CastBroadcastState> {
	const state = DesignScenario.build({
		scenario: {
			scene,
			transition: "cut",
			names: "typical",
			set: "ongoing",
			bestOf: 5,
			ink: null,
			swapSides: false,
			seeds: false,
			logos: false,
			placeholderLogos: false,
			players: 4,
			casters: 0,
			otherMatches: 0,
			headline: false,
			bracket: "double_elimination",
			bracketFocus: "remaining",
		},
		tournament: { name: "In The Zone", logoUrl: "" },
		settings: DEFAULT_CAST_BROADCAST_SETTINGS,
		takenAt: Date.now(),
	});

	return { state, transition };
}
