/**
 * Worker/browser IO for ScoreboardResources: fetches the CDN-hosted CV
 * assets (assets repo `assets/cv/v1/**`) over HTTP. What the bundle
 * contains — every key, template option set, and atlas name — lives in
 * core/resources.ts, shared with the Node loader. The base URL arrives via
 * the worker init message (see worker/protocol.ts) so this module never
 * imports the app config.
 */

import {
  loadPlannerStages,
  type PlannerManifest,
  type PlannerStage,
} from "../core/detectors/minimap/stage";
import type { ScoreboardResources } from "../core/detectors/scoreboard/index";
import { type AtlasMeta, type GlyphSet, loadGlyphSet } from "../core/glyphs";
import type { FrameData } from "../core/image";
import { assembleScoreboardResources } from "../core/resources";

async function fetchImage(url: string): Promise<FrameData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: data.width, height: data.height, data: data.data };
}

function makeFetchAtlas(base: string) {
  return async function fetchAtlas(name: string): Promise<() => GlyphSet | null> {
    try {
      const [meta, image] = await Promise.all([
        fetch(`${base}/glyphs/${name}.json`).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<AtlasMeta>;
        }),
        fetchImage(`${base}/glyphs/${name}.png`),
      ]);
      const set = loadGlyphSet(image, meta);
      return () => set;
    } catch {
      return () => null;
    }
  };
}

function makeFetchPlannerStages(base: string) {
  return async function fetchPlannerStages(): Promise<() => PlannerStage[] | null> {
    try {
      const [manifest, atlas] = await Promise.all([
        fetch(`${base}/planner/manifest.json`).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<PlannerManifest>;
        }),
        fetchImage(`${base}/planner/signatures.png`),
      ]);
      const stages = loadPlannerStages(atlas, manifest);
      return () => stages;
    } catch {
      return () => null;
    }
  };
}

/** Requires loadOpenCV() to have resolved. */
export function fetchScoreboardResources(base: string): Promise<ScoreboardResources> {
  return assembleScoreboardResources({
    readManifest: (dir) =>
      fetch(`${base}/${dir}/manifest.json`).then((r) => r.json() as Promise<string[]>),
    readIcon: (dir, id) => fetchImage(`${base}/${dir}/${id}.png`),
    loadAtlas: makeFetchAtlas(base),
    loadPlannerStages: makeFetchPlannerStages(base),
  });
}
