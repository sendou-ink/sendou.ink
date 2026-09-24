/*
 * Exact template-match cross sums for core/match-steps.ts: for every
 * placement (x, y), x in [lo, hi] and y in [0, rows), the sum of
 * template·image products over the template's rows (samples interleaved, so
 * all channels at once). u8 inputs widened to i16 lanes and multiplied with
 * i32x4.dot_i16x8_s; sums stay exact below 2^32 (the caller's size limit).
 *
 * Regenerate CROSS_SUMS_WASM in cross-sums.ts after an edit (Apple clang
 * ships the wasm32 target; no linker is needed):
 *   clang --target=wasm32 -O3 -msimd128 -nostdlib -c cross-sums.c -o cross-sums.o
 *   base64 -i cross-sums.o | tr -d '\n'
 * The object is instantiated as is: it imports only its memory (and an unused
 * table), so keep the function free of stack use, data and calls.
 */
#include <wasm_simd128.h>

typedef unsigned char u8;
typedef unsigned int u32;

__attribute__((export_name("crossSums")))
void crossSums(const u8* image, u32 imageRowLength, const u8* tpl, u32 tRows,
               u32 tRowLength, u32 rows, u32 lo, u32 hi, u32 ch, u32* out) {
  u32 width = hi - lo + 1;
  for (u32 y = 0; y < rows; y++) {
    for (u32 x = lo; x <= hi; x++) {
      v128_t acc = wasm_i32x4_splat(0);
      u32 tail = 0;
      for (u32 ty = 0; ty < tRows; ty++) {
        const u8* ip = image + (y + ty) * imageRowLength + x * ch;
        const u8* tp = tpl + ty * tRowLength;
        u32 k = 0;
        for (; k + 16 <= tRowLength; k += 16) {
          v128_t a = wasm_v128_load(ip + k);
          v128_t b = wasm_v128_load(tp + k);
          acc = wasm_i32x4_add(acc, wasm_i32x4_dot_i16x8(wasm_u16x8_extend_low_u8x16(a), wasm_u16x8_extend_low_u8x16(b)));
          acc = wasm_i32x4_add(acc, wasm_i32x4_dot_i16x8(wasm_u16x8_extend_high_u8x16(a), wasm_u16x8_extend_high_u8x16(b)));
        }
        for (; k < tRowLength; k++) tail += (u32)ip[k] * tp[k];
      }
      out[y * width + (x - lo)] = tail + (u32)wasm_i32x4_extract_lane(acc, 0) +
                                  (u32)wasm_i32x4_extract_lane(acc, 1) +
                                  (u32)wasm_i32x4_extract_lane(acc, 2) +
                                  (u32)wasm_i32x4_extract_lane(acc, 3);
    }
  }
}
