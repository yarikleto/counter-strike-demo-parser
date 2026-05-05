// csdemo_native.h
//
// Native addon for counter-strike-demo-parser.
//
// This is a SPIKE (TASK-082): the only export is a trivial `add(a, b)` used
// to validate the build/load/fallback toolchain on the target host. Real
// functionality (BitReader, etc.) is deferred to TASK-083+.
#ifndef CSDEMO_NATIVE_H_
#define CSDEMO_NATIVE_H_

#include <napi.h>

namespace csdemo {

// add(a: number, b: number): number — returns a + b as a JS Number.
Napi::Value Add(const Napi::CallbackInfo& info);

}  // namespace csdemo

#endif  // CSDEMO_NATIVE_H_
