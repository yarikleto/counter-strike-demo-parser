# Native addon (`csdemo_native`)

Optional N-API addon for `counter-strike-demo-parser`. The pure-TS path is
fully functional on its own; the native module is opt-in and is loaded with
graceful fallback (see `src/native/index.ts`).

## Build

```bash
npm install            # ensures node-addon-api / node-gyp are available
npm run build:native   # configures + builds native/build/Release/csdemo_native.node
```

To clean and rebuild:

```bash
npm run rebuild:native
```

## Status

This is a SPIKE (TASK-082). The only export is a trivial `add(a, b)` used to
validate the toolchain. Real native acceleration (BitReader, etc.) is
introduced in later tasks.

## Requirements

- Node.js >= 22 (matches the package `engines.node`).
- A C++17 toolchain.
  - **macOS:** Xcode Command Line Tools. If `node-gyp configure` fails with
    a `gyp: No Xcode or CLT version detected` error, run:
    ```bash
    xcode-select --install
    ```
  - **Linux:** `build-essential` (or distro equivalent) + Python 3.
  - **Windows:** the `windows-build-tools` story is messy; install Visual
    Studio Build Tools with the "Desktop development with C++" workload.

## Layout

```
native/
├── binding.gyp           # node-gyp build config
├── src/
│   ├── csdemo_native.cc  # addon entry + exported functions
│   └── csdemo_native.h
└── build/                # generated (gitignored)
    └── Release/
        └── csdemo_native.node
```

The TS loader `src/native/index.ts` `require`s the `.node` file inside a
`try/catch`; if it is missing (consumer hasn't built, or no prebuilt for
their platform) it exposes `nativeAddon === undefined` and the library
falls back to the pure-TS implementation transparently.
