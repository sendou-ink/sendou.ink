import { scrimsPage } from "~/utils/urls";
import { scrimsSearchParams } from "./scrims-search-params";

export const scrimsByAssociationPage = (associationId: number) =>
	scrimsSearchParams.href(scrimsPage(), { associationId });
