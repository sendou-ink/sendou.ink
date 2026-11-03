import { useEffect } from "react";
import { useLocation } from "react-router";

declare global {
	interface Window {
		fusetag: {
			que: Array<() => void>;
			pageInit?: () => void;
			registerZone?: (id: string) => void;
		};
	}
}

/** Fuse appends the sticky footer ad as a direct child of `<body>`, its height depends on the served creative. */
export const FUSE_STICKY_FOOTER_SELECTOR =
	".publift-widget-sticky_footer-container";

function callPageInit() {
	window.fusetag = window.fusetag || { que: [] };
	window.fusetag.que.push(() => {
		window.fusetag.pageInit?.();
	});
}

export function FusePageInit() {
	const { pathname } = useLocation();

	useEffect(() => {
		callPageInit();
	}, [pathname]);

	return null;
}

export function FuseZone({
	id,
	fuseSlot,
	className,
}: {
	id: string;
	fuseSlot: string;
	className?: string;
}) {
	useEffect(() => {
		window.fusetag = window.fusetag || { que: [] };
		window.fusetag.que.push(() => {
			window.fusetag.registerZone?.(id);
		});
	}, [id]);

	return <div id={id} data-fuse={fuseSlot} className={className} />;
}
