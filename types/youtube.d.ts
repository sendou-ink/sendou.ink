interface Window {
	YT: typeof YT;
	onYouTubeIframeAPIReady: () => void;
}

declare namespace YT {
	class Player {
		constructor(
			elementId: HTMLElement,
			options: {
				height: string;
				width: string;
				videoId: string;
				playerVars?: {
					autoplay?: number;
					controls?: number;
					rel?: number;
					modestbranding?: number;
					start?: number;
				};
				events?: {
					onReady?: () => void;
					onError?: (event: { data: number }) => void;
				};
			},
		);
		loadVideoById(options: { videoId: string; startSeconds?: number }): void;
		getCurrentTime(): number;
	}
}
