import * as React from "react";
import { useBackgroundResource } from "~/hooks/useBackgroundResource";
import { useReloadOnNewDeploy } from "~/hooks/useReloadOnNewDeploy";
import type { RootLoaderData } from "~/root";
import type { SerializeFrom } from "~/utils/remix";
import { LAYOUT_DATA_ROUTE } from "~/utils/urls";
import type { loader } from "./routes/api.layout";

const TEN_MINUTES = 10 * 60 * 1000;

interface LayoutData {
	/** `null` when the server has no session, `undefined` when it has not said. */
	loggedInUserId?: number | null;
	sidebar?: RootLoaderData["sidebar"];
	buildCommit?: string;
}

interface LayoutDataContextValue extends LayoutData {
	/** Refetches the app shell data, without touching the page's own loaders. */
	refresh: () => void;
	isRefreshing: boolean;
}

const LayoutDataContext = React.createContext<LayoutDataContextValue>({
	refresh: () => {},
	isRefreshing: false,
});

/**
 * App shell data that goes stale while a page sits open: from the root loader first, then a polled
 * resource route, so pages with expensive loaders are not refetched just to refresh the sidebar.
 */
export function LayoutDataProvider({
	data,
	children,
}: {
	data?: RootLoaderData;
	children: React.ReactNode;
}) {
	const {
		data: polledData,
		isLoading,
		refresh,
	} = useBackgroundResource<SerializeFrom<typeof loader>>(LAYOUT_DATA_ROUTE);

	// a ref so a poll elsewhere does not re-run the effect and restart the interval before it fires
	const isLoadingRef = React.useRef(isLoading);
	isLoadingRef.current = isLoading;

	React.useEffect(() => {
		const loadIfIdle = () => {
			if (!isLoadingRef.current) {
				void refresh();
			}
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				loadIfIdle();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		const interval = setInterval(loadIfIdle, TEN_MINUTES);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			clearInterval(interval);
		};
	}, [refresh]);

	const newest = useNewestOf(data, polledData);

	useReloadOnNewDeploy(newest.buildCommit ?? "");
	useReloadOnStaleAuth({
		clientUserId: data?.user?.id,
		serverUserId: newest.loggedInUserId,
	});

	const value: LayoutDataContextValue = {
		...newest,
		refresh,
		isRefreshing: isLoading,
	};

	return (
		<LayoutDataContext.Provider value={value}>
			{children}
		</LayoutDataContext.Provider>
	);
}

/** App shell data, fresher than the root loader whenever a poll has landed since. */
export function useLayoutData() {
	return React.useContext(LayoutDataContext);
}

function useReloadOnStaleAuth({
	clientUserId,
	serverUserId,
}: {
	clientUserId: number | undefined;
	serverUserId: number | null | undefined;
}) {
	React.useEffect(() => {
		if (typeof clientUserId !== "number") return;
		// undefined = the server has not weighed in yet, only null means logged out
		if (serverUserId === undefined || serverUserId === clientUserId) return;

		window.location.reload();
	}, [clientUserId, serverUserId]);
}

/** Whichever arrived last; neither the root loader nor the poll is reliably the newer one. */
function useNewestOf(
	rootData: RootLoaderData | undefined,
	polledData: LayoutData | undefined,
): LayoutData {
	const previous = React.useRef({ rootData, polledData });
	const newest = React.useRef<"root" | "polled">("root");

	if (rootData !== previous.current.rootData) {
		previous.current.rootData = rootData;
		newest.current = "root";
	}
	if (polledData !== previous.current.polledData) {
		previous.current.polledData = polledData;
		newest.current = "polled";
	}

	if (newest.current === "polled" && polledData) return polledData;

	return rootData ?? {};
}
