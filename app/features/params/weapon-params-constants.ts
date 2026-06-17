/**
 * Sentinel `category` used for the special points entry in patch change data, since special
 * points are not a regular weapon parameter. The matching `key` is also this value.
 */
export const SPECIAL_POINTS_PARAM_KEY = "__specialPoints__";

/**
 * Sentinel `category` used for damage multiplier (damage rate vs objects) entries in patch
 * change data. The `key` of such a change holds the damage receiver target instead.
 */
export const DAMAGE_MULTIPLIER_PARAM_KEY = "__damageMultiplier__";
