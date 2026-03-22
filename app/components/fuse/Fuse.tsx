import { useEffect, useRef } from "react";
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

function callPageInit() {
	window.fusetag = window.fusetag || { que: [] };
	window.fusetag.que.push(() => {
		window.fusetag.pageInit?.();
	});
}

export function FusePageInit() {
	const { pathname } = useLocation();
	const previousPathname = useRef(pathname);

	useEffect(() => {
		callPageInit();
	}, []);

	useEffect(() => {
		if (previousPathname.current === pathname) return;

		previousPathname.current = pathname;
		callPageInit();
	});

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
