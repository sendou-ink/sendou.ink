/*
 * In-place color conversions for core/frame-kernels.ts, bit-identical to
 * OpenCV's 8-bit cvtColor: RGBA2GRAY is its 15-bit fixed point
 * (R·9798 + G·19235 + B·3735 + 2^14) >> 15, RGBA2RGB drops alpha. The
 * module imports OpenCV's own memory, so it reads and writes Mat data where
 * it lies.
 *
 * Regenerate FRAME_KERNELS_WASM in frame-kernels.ts after an edit (Apple
 * clang ships the wasm32 target; no linker is needed):
 *   clang --target=wasm32 -O3 -msimd128 -nostdlib -c frame-kernels.c -o frame-kernels.o
 *   base64 -i frame-kernels.o | tr -d '\n'
 * The object is instantiated as is: it imports only its memory (and an unused
 * table), so keep the functions free of stack use, data and calls.
 */
#include <wasm_simd128.h>

typedef unsigned char u8;
typedef unsigned int u32;

static inline v128_t grayOf4(const u8* p, v128_t coef, v128_t half) {
  v128_t px = wasm_v128_load(p);
  v128_t lo = wasm_i32x4_dot_i16x8(wasm_u16x8_extend_low_u8x16(px), coef);
  v128_t hi = wasm_i32x4_dot_i16x8(wasm_u16x8_extend_high_u8x16(px), coef);
  v128_t sum = wasm_i32x4_add(wasm_i32x4_shuffle(lo, hi, 0, 2, 4, 6),
                              wasm_i32x4_shuffle(lo, hi, 1, 3, 5, 7));
  return wasm_u32x4_shr(wasm_i32x4_add(sum, half), 15);
}

__attribute__((export_name("rgbaToGray")))
void rgbaToGray(const u8* src, u8* dst, u32 n) {
  const v128_t coef = wasm_i16x8_make(9798, 19235, 3735, 0, 9798, 19235, 3735, 0);
  const v128_t half = wasm_i32x4_splat(1 << 14);
  u32 i = 0;
  for (; i + 16 <= n; i += 16) {
    const u8* p = src + i * 4;
    v128_t w01 = wasm_u16x8_narrow_i32x4(grayOf4(p, coef, half), grayOf4(p + 16, coef, half));
    v128_t w23 = wasm_u16x8_narrow_i32x4(grayOf4(p + 32, coef, half), grayOf4(p + 48, coef, half));
    wasm_v128_store(dst + i, wasm_u8x16_narrow_i16x8(w01, w23));
  }
  for (; i < n; i++) {
    const u8* p = src + i * 4;
    dst[i] = (u8)((p[0] * 9798 + p[1] * 19235 + p[2] * 3735 + (1 << 14)) >> 15);
  }
}

__attribute__((export_name("rgbaToRgb")))
void rgbaToRgb(const u8* src, u8* dst, u32 n) {
  u32 i = 0;
  // 16-byte stores of 12 valid bytes; the next group overwrites the rest, so
  // stop while a whole store still fits inside dst
  for (; i + 6 <= n; i += 4) {
    v128_t px = wasm_v128_load(src + i * 4);
    wasm_v128_store(dst + i * 3, wasm_i8x16_shuffle(px, px, 0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 0, 0, 0, 0));
  }
  for (; i < n; i++) {
    dst[i * 3] = src[i * 4];
    dst[i * 3 + 1] = src[i * 4 + 1];
    dst[i * 3 + 2] = src[i * 4 + 2];
  }
}
