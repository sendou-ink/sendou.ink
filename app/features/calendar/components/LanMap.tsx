import {
	type GeoJSONSource,
	LngLatBounds,
	Map as MapLibreMap,
	Marker,
	NavigationControl,
	Popup,
	setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Alert } from "~/components/Alert";
import { Flag } from "~/components/Flag";
import { VenueLocaleTime } from "~/components/VenueLocaleTime";
import { useTheme } from "~/features/theme/core/provider";
import type { SerializeFrom } from "~/utils/remix";
import { smallImageUrl } from "~/utils/urls";
import type { LanMapLoaderData } from "../loaders/calendar.lan-map.server";
import styles from "./LanMap.module.css";

import "../lan-map-global.css";

const STYLE_URLS = {
	light: "https://tiles.openfreemap.org/styles/positron",
	dark: "https://tiles.openfreemap.org/styles/dark",
};
const SOURCE_ID = "lans";
/** Invisible, a source is only tiled (and its clusters queryable) while a layer uses it. */
const LAYER_ID = "lans-hidden";
const CLUSTER_RADIUS_PX = 48;
const FIT_PADDING_PX = 64;
const FIT_MAX_ZOOM = 6;
const POPUP_OFFSET_PX = 24;
const CARD_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	weekday: "short",
	day: "numeric",
	month: "short",
	hour: "numeric",
	minute: "numeric",
};

setWorkerUrl(workerUrl);

type Lan = SerializeFrom<LanMapLoaderData>["lans"][number];

/** Upcoming LANs on a world map: clustered markers and a card per LAN. */
export function LanMap({ lans }: { lans: Lan[] }) {
	const { t } = useTranslation(["calendar"]);
	const { htmlThemeClass } = useTheme();
	const containerRef = React.useRef<HTMLDivElement>(null);
	const mapRef = React.useRef<MapLibreMap | null>(null);
	const popupRef = React.useRef<Popup | null>(null);
	const [popupContent] = React.useState(() => document.createElement("div"));
	const [selected, setSelected] = React.useState<Lan | null>(null);
	const [isMapUnsupported, setIsMapUnsupported] = React.useState(false);

	const styleUrl =
		htmlThemeClass === "light" ? STYLE_URLS.light : STYLE_URLS.dark;
	const appliedStyleUrlRef = React.useRef(styleUrl);

	const openCard = (lan: Lan) => {
		const map = mapRef.current;
		const popup = popupRef.current;
		if (!map || !popup) return;

		popup
			.setLngLat([lan.venue.longitude, lan.venue.latitude])
			.setDOMContent(popupContent)
			.addTo(map);
		// after, as moving an open popup closes it first
		setSelected(lan);
	};

	React.useEffect(() => {
		if (!containerRef.current) return;

		let map: MapLibreMap;
		try {
			map = new MapLibreMap({
				container: containerRef.current,
				style: appliedStyleUrlRef.current,
				center: [0, 30],
				zoom: 1,
				attributionControl: { compact: true },
			});
		} catch {
			// e.g. WebGL turned off
			setIsMapUnsupported(true);
			return;
		}
		map.addControl(new NavigationControl({ showCompass: false }));
		mapRef.current = map;

		const popup = new Popup({
			closeButton: false,
			closeOnClick: false,
			offset: POPUP_OFFSET_PX,
			maxWidth: "none",
			className: styles.popup,
		});
		popup.on("close", () => setSelected(null));
		popupRef.current = popup;

		const lansById = new Map(lans.map((lan) => [lan.id, lan]));

		if (lans.length > 0) {
			const bounds = new LngLatBounds();
			for (const lan of lans) {
				bounds.extend([lan.venue.longitude, lan.venue.latitude]);
			}
			map.fitBounds(bounds, {
				padding: FIT_PADDING_PX,
				maxZoom: FIT_MAX_ZOOM,
				duration: 0,
			});
		}

		// a theme switch reloads the style, dropping the source and layer
		map.on("style.load", () => {
			map.addSource(SOURCE_ID, {
				type: "geojson",
				data: lansGeoJson(lans),
				cluster: true,
				clusterRadius: CLUSTER_RADIUS_PX,
			});
			map.addLayer({
				id: LAYER_ID,
				type: "circle",
				source: SOURCE_ID,
				paint: { "circle-radius": 0, "circle-opacity": 0 },
			});
		});

		const markers = new Map<string, Marker>();
		let markersOnScreen = new Map<string, Marker>();

		const createLanMarker = (lan: Lan) => {
			const element = document.createElement("button");
			element.type = "button";
			element.className = styles.marker;
			element.setAttribute("aria-label", lan.name);
			const img = document.createElement("img");
			img.src = smallImageUrl(lan.logoUrl);
			img.alt = "";
			img.className = styles.markerImg;
			element.append(img);
			element.addEventListener("click", () => openCard(lan));

			return new Marker({ element }).setLngLat([
				lan.venue.longitude,
				lan.venue.latitude,
			]);
		};

		const createClusterMarker = (
			clusterId: number,
			count: number,
			coordinates: [number, number],
		) => {
			const element = document.createElement("button");
			element.type = "button";
			element.className = styles.cluster;
			element.textContent = String(count);
			element.setAttribute(
				"aria-label",
				t("calendar:lanMap.cluster", { count }),
			);
			element.addEventListener("click", async () => {
				const source = map.getSource<GeoJSONSource>(SOURCE_ID);
				if (!source) return;

				const zoom = await source.getClusterExpansionZoom(clusterId);
				map.easeTo({ center: coordinates, zoom });
			});

			return new Marker({ element }).setLngLat(coordinates);
		};

		const updateMarkers = () => {
			if (!map.getSource(SOURCE_ID) || !map.isSourceLoaded(SOURCE_ID)) return;

			const nextMarkers = new Map<string, Marker>();
			for (const feature of map.querySourceFeatures(SOURCE_ID)) {
				if (feature.geometry.type !== "Point") continue;
				const coordinates = feature.geometry.coordinates as [number, number];
				const properties = feature.properties;

				const key = properties.cluster
					? `cluster-${properties.cluster_id}`
					: `lan-${properties.id}`;
				if (nextMarkers.has(key)) continue;

				let marker = markers.get(key);
				if (!marker) {
					const lan = lansById.get(properties.id);
					if (properties.cluster) {
						marker = createClusterMarker(
							properties.cluster_id,
							properties.point_count,
							coordinates,
						);
					} else if (lan) {
						marker = createLanMarker(lan);
					} else {
						continue;
					}
					markers.set(key, marker);
				}

				nextMarkers.set(key, marker);
				if (!markersOnScreen.has(key)) marker.addTo(map);
			}

			for (const [key, marker] of markersOnScreen) {
				if (!nextMarkers.has(key)) marker.remove();
			}
			markersOnScreen = nextMarkers;
		};

		map.on("render", updateMarkers);
		map.on("click", (event) => {
			const target = event.originalEvent.target;
			if (target instanceof Element && target.closest(`.${styles.marker}`)) {
				return;
			}

			popup.remove();
		});

		return () => {
			popup.remove();
			map.remove();
			mapRef.current = null;
			popupRef.current = null;
		};
	}, []);

	React.useEffect(() => {
		const map = mapRef.current;
		if (!map || appliedStyleUrlRef.current === styleUrl) return;

		appliedStyleUrlRef.current = styleUrl;
		map.setStyle(styleUrl, { diff: false });
	}, [styleUrl]);

	return (
		<div className="stack sm">
			{isMapUnsupported ? (
				<Alert variation="ERROR" tiny>
					{t("calendar:lanMap.unsupported")}
				</Alert>
			) : null}
			<div ref={containerRef} className={styles.map} data-testid="lan-map" />
			{selected ? createPortal(<LanCard lan={selected} />, popupContent) : null}
		</div>
	);
}

function LanCard({ lan }: { lan: Lan }) {
	return (
		<div className={styles.card} data-testid="lan-card">
			<img
				src={smallImageUrl(lan.logoUrl)}
				width={40}
				height={40}
				className={styles.cardImg}
				alt=""
			/>
			<div className={styles.cardBody}>
				<Link to={lan.url} className={styles.cardName}>
					{lan.name}
				</Link>
				<VenueLocaleTime
					date={lan.startsAt}
					options={CARD_DATE_OPTIONS}
					venueTimezone={lan.venue.timezone}
					className={styles.cardTime}
				/>
				<div className={styles.cardPlace}>
					<span>{lan.venue.city ?? lan.venue.name}</span>
					<Flag tiny countryCode={lan.venue.countryCode} />
				</div>
			</div>
		</div>
	);
}

function lansGeoJson(lans: Lan[]) {
	return {
		type: "FeatureCollection" as const,
		features: lans.map((lan) => ({
			type: "Feature" as const,
			geometry: {
				type: "Point" as const,
				coordinates: [lan.venue.longitude, lan.venue.latitude],
			},
			properties: { id: lan.id },
		})),
	};
}
