import { logger } from "~/utils/logger";
import * as MicInput from "./core/MicInput";
import { DEFAULT_DEVICE_ID, type VoiceSettings } from "./voice-persisted";

const GATE_PROCESSOR_NAME = "voice-gate";
const GATE_HOLD_SECONDS = 0.3;
const GATE_ATTACK_SECONDS = 0.005;
const GATE_RELEASE_SECONDS = 0.08;
const ANALYSER_FFT_SIZE = 1024;

// loaded from a Blob so it skips the bundler, this is very hacky but the only way to get an AudioWorkletProcessor in a module context, we can likely remove this when we ditch Daily
const GATE_PROCESSOR_SOURCE = `
class VoiceGateProcessor extends AudioWorkletProcessor {
	static get parameterDescriptors() {
		return [{ name: "threshold", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" }];
	}

	constructor() {
		super();
		this.gain = 1;
		this.openUntil = 0;
		this.attack = 1 - Math.exp(-1 / (${GATE_ATTACK_SECONDS} * sampleRate));
		this.release = 1 - Math.exp(-1 / (${GATE_RELEASE_SECONDS} * sampleRate));
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0];
		const output = outputs[0];
		if (!input || input.length === 0) return true;

		const threshold = parameters.threshold[0];
		let sum = 0;
		let count = 0;
		for (const channel of input) {
			for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
			count += channel.length;
		}
		if (threshold === 0 || Math.sqrt(sum / count) >= threshold) {
			this.openUntil = currentTime + ${GATE_HOLD_SECONDS};
		}

		const target = currentTime < this.openUntil ? 1 : 0;
		const coefficient = target > this.gain ? this.attack : this.release;
		for (let i = 0; i < input[0].length; i++) {
			this.gain += (target - this.gain) * coefficient;
			for (let c = 0; c < output.length; c++) {
				output[c][i] = (input[c] ?? input[0])[i] * this.gain;
			}
		}

		return true;
	}
}

registerProcessor("${GATE_PROCESSOR_NAME}", VoiceGateProcessor);
`;

export type MicCaptureSettings = Pick<
	VoiceSettings,
	| "inputDeviceId"
	| "echoCancellation"
	| "noiseSuppression"
	| "autoGainControl"
	| "inputVolume"
	| "sensitivity"
>;

export interface MicCaptureOptions {
	gateAlwaysOpen: boolean;
}

export class MicCaptureError extends Error {
	readonly kind: "MIC_DENIED" | "MIC_NOT_FOUND";

	constructor(
		kind: MicCaptureError["kind"],
		{ cause }: { cause: DOMException },
	) {
		super(cause.message, { cause });
		this.kind = kind;
	}
}

interface Pipeline {
	context: AudioContext;
	stream: MediaStream;
	source: MediaStreamAudioSourceNode;
	gain: GainNode;
	analyser: AnalyserNode;
	gate: AudioWorkletNode | null;
	destination: MediaStreamAudioDestinationNode;
	settings: MicCaptureSettings;
	samples: Float32Array<ArrayBuffer>;
}

let pipeline: Pipeline | null = null;
let recaptures: Promise<void> = Promise.resolve();

export function canPickOutputDevice() {
	return (
		typeof HTMLMediaElement !== "undefined" &&
		"setSinkId" in HTMLMediaElement.prototype
	);
}

export const micCapture = {
	start: async (
		settings: MicCaptureSettings,
		options: MicCaptureOptions,
	): Promise<MediaStreamTrack> => {
		micCapture.stop();

		const context = new AudioContext({ latencyHint: "interactive" });
		try {
			const stream = await acquire(settings);
			const gain = context.createGain();
			const analyser = context.createAnalyser();
			analyser.fftSize = ANALYSER_FFT_SIZE;
			const destination = context.createMediaStreamDestination();
			destination.channelCount = 1;
			const gate = await createGate(context);

			const source = context.createMediaStreamSource(stream);
			source.connect(gain);
			gain.connect(analyser);
			gain.connect(gate ?? destination);
			gate?.connect(destination);

			pipeline = {
				context,
				stream,
				source,
				gain,
				analyser,
				gate,
				destination,
				settings,
				samples: new Float32Array(ANALYSER_FFT_SIZE),
			};
			applyLevels(pipeline, settings, options);
			watchForEndedTrack(pipeline);
			resumeWhenAllowed(context);

			return destination.stream.getAudioTracks()[0];
		} catch (error) {
			void context.close();
			throw error;
		}
	},
	update: (settings: MicCaptureSettings, options: MicCaptureOptions) => {
		const current = pipeline;
		if (!current) return;

		applyLevels(current, settings, options);
		if (MicInput.needsRecapture(current.settings, settings)) {
			queueRecapture(current, settings);
		}
		current.settings = settings;
	},
	isCapturing: () => pipeline !== null,
	level: () => {
		if (!pipeline) return 0;

		pipeline.analyser.getFloatTimeDomainData(pipeline.samples);
		return MicInput.rms(pipeline.samples);
	},
	resume: () => {
		void pipeline?.context.resume().catch(() => {});
	},
	stop: () => {
		if (!pipeline) return;

		stopTracks(pipeline.stream);
		void pipeline.context.close();
		pipeline = null;
	},
};

async function acquire(settings: MicCaptureSettings): Promise<MediaStream> {
	try {
		return await navigator.mediaDevices.getUserMedia({
			audio: MicInput.captureConstraints(
				settings,
				navigator.mediaDevices.getSupportedConstraints(),
			),
		});
	} catch (error) {
		if (!(error instanceof DOMException)) throw error;

		const isMissingDevice =
			error.name === "NotFoundError" || error.name === "OverconstrainedError";
		if (isMissingDevice && settings.inputDeviceId !== DEFAULT_DEVICE_ID) {
			return acquire({ ...settings, inputDeviceId: DEFAULT_DEVICE_ID });
		}
		if (error.name === "NotAllowedError" || error.name === "SecurityError") {
			throw new MicCaptureError("MIC_DENIED", { cause: error });
		}
		if (isMissingDevice) {
			throw new MicCaptureError("MIC_NOT_FOUND", { cause: error });
		}
		throw error;
	}
}

async function createGate(context: AudioContext) {
	if (!context.audioWorklet) return null;

	const url = URL.createObjectURL(
		new Blob([GATE_PROCESSOR_SOURCE], { type: "text/javascript" }),
	);
	try {
		await context.audioWorklet.addModule(url);
		return new AudioWorkletNode(context, GATE_PROCESSOR_NAME);
	} catch (error) {
		logger.warn(
			"Voice activity gate unavailable, sending the mic as is",
			error,
		);
		return null;
	} finally {
		URL.revokeObjectURL(url);
	}
}

function applyLevels(
	current: Pipeline,
	settings: MicCaptureSettings,
	options: MicCaptureOptions,
) {
	current.gain.gain.value = settings.inputVolume / 100;
	current.gate?.parameters
		.get("threshold")
		?.setValueAtTime(
			options.gateAlwaysOpen ? 0 : MicInput.gateThreshold(settings.sensitivity),
			current.context.currentTime,
		);
}

function queueRecapture(current: Pipeline, settings: MicCaptureSettings) {
	const previous = current.settings;

	recaptures = recaptures.then(async () => {
		if (pipeline !== current) return;

		current.source.disconnect();
		stopTracks(current.stream);

		const stream = await acquireOrKeep(settings, previous);
		if (!stream) return;
		if (pipeline !== current) {
			stopTracks(stream);
			return;
		}

		const source = current.context.createMediaStreamSource(stream);
		source.connect(current.gain);
		current.source = source;
		current.stream = stream;
		watchForEndedTrack(current);
	});
}

async function acquireOrKeep(
	settings: MicCaptureSettings,
	previous: MicCaptureSettings,
) {
	try {
		return await acquire(settings);
	} catch (error) {
		logger.warn("Switching the voice call's microphone failed", error);
	}

	try {
		return await acquire(previous);
	} catch (error) {
		logger.error("Getting the voice call's microphone back failed", error);
		return null;
	}
}

function watchForEndedTrack(current: Pipeline) {
	const [track] = current.stream.getAudioTracks();
	track?.addEventListener(
		"ended",
		() => {
			if (
				pipeline === current &&
				current.stream.getAudioTracks()[0] === track
			) {
				queueRecapture(current, current.settings);
			}
		},
		{ once: true },
	);
}

function resumeWhenAllowed(context: AudioContext) {
	if (context.state !== "suspended") return;

	const resume = () => void context.resume().catch(() => {});
	const stopListening = () => {
		if (context.state === "suspended") return;

		window.removeEventListener("pointerdown", resume);
		window.removeEventListener("keydown", resume);
		context.removeEventListener("statechange", stopListening);
	};
	window.addEventListener("pointerdown", resume);
	window.addEventListener("keydown", resume);
	context.addEventListener("statechange", stopListening);
	resume();
}

function stopTracks(stream: MediaStream) {
	for (const track of stream.getTracks()) track.stop();
}
