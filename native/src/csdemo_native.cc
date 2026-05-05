// csdemo_native.cc
//
// SPIKE (TASK-082): trivial N-API addon with a single `add(a, b)` export
// to prove the build/load/fallback cycle. Real native code lands in later
// tasks. Uses node-addon-api (C++ wrapper) for ergonomics.

#include "csdemo_native.h"

namespace csdemo {

Napi::Value Add(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "add(a, b) requires two arguments")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  if (!info[0].IsNumber() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "add(a, b) arguments must be numbers")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  const double a = info[0].As<Napi::Number>().DoubleValue();
  const double b = info[1].As<Napi::Number>().DoubleValue();
  return Napi::Number::New(env, a + b);
}

}  // namespace csdemo

// NODE_API_MODULE concatenates the second argument as an identifier via
// token-pasting (`__napi_##regfunc`), so it cannot be a namespaced name.
// Keep the registration function at file scope and forward to the real impl.
static Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "add"),
              Napi::Function::New(env, csdemo::Add));
  return exports;
}

NODE_API_MODULE(csdemo_native, InitModule)
