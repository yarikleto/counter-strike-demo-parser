#!/usr/bin/env bash
#
# generate-proto.sh
#
# Generates TypeScript decoders from vendored Valve .proto files using ts-proto.
# Output is written to src/generated/ and is checked into the repository
# (see CLAUDE.md: project structure).
#
# Requires: protoc (libprotoc 3.x+) on PATH, and ts-proto installed locally
# (devDependency). Run via `npm run generate:proto`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROTO_DIR="${REPO_ROOT}/proto"
OUT_DIR="${REPO_ROOT}/src/generated"
PLUGIN="${REPO_ROOT}/node_modules/.bin/protoc-gen-ts_proto"

if ! command -v protoc >/dev/null 2>&1; then
  echo "error: 'protoc' not found on PATH. Install protobuf compiler:" >&2
  echo "  macOS:  brew install protobuf" >&2
  echo "  Linux:  apt-get install -y protobuf-compiler" >&2
  exit 1
fi

if [[ ! -x "${PLUGIN}" ]]; then
  echo "error: ts-proto plugin not found at ${PLUGIN}" >&2
  echo "       Run 'npm install' first." >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
# Wipe stale generated output so removed messages don't linger.
find "${OUT_DIR}" -type f -name '*.ts' -delete

# Discover all vendored .proto files (basenames only).
# Use a portable loop instead of `mapfile` (not available in Bash 3 on macOS).
PROTO_FILES=()
while IFS= read -r line; do
  PROTO_FILES+=("$line")
done < <(cd "${PROTO_DIR}" && find . -type f -name '*.proto' | sed 's|^\./||' | sort)

if [[ ${#PROTO_FILES[@]} -eq 0 ]]; then
  echo "error: no .proto files found in ${PROTO_DIR}" >&2
  exit 1
fi

echo "Generating TypeScript from ${#PROTO_FILES[@]} proto file(s):"
printf '  - %s\n' "${PROTO_FILES[@]}"

# ts-proto options:
#   esModuleInterop=true   -> interop with CJS consumers
#   forceLong=bigint       -> int64/uint64 -> bigint (no extra dep)
#   useOptionals=messages  -> message-typed fields are optional in TS
#   outputServices=false   -> skip gRPC service stubs (we only decode wire data)
#   oneof=unions           -> oneof becomes a discriminated union (type-safe)
TS_PROTO_OPTS="esModuleInterop=true,forceLong=bigint,useOptionals=messages,outputServices=false,oneof=unions"

protoc \
  --plugin="protoc-gen-ts_proto=${PLUGIN}" \
  --proto_path="${PROTO_DIR}" \
  --ts_proto_out="${OUT_DIR}" \
  --ts_proto_opt="${TS_PROTO_OPTS}" \
  "${PROTO_FILES[@]}"

echo "Generated TypeScript at ${OUT_DIR}"
