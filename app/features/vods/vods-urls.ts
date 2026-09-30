import { VODS_PAGE } from "~/utils/urls";
import { vodsNewSearchParams } from "./vods-search-params";

export const newVodPage = (vodToEditId?: number) =>
	vodsNewSearchParams.href(`${VODS_PAGE}/new`, { vod: vodToEditId ?? null });
