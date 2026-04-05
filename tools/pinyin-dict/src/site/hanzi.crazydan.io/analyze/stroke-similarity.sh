#!/bin/bash
_DIR_="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

ROOT_DIR="$(cd "${_DIR_}/../../.." && pwd -P)"

GEN_PY_FILE="${_DIR_}/lib/stroke-similarity.py"

TARGET_DB_FILE="${ROOT_DIR}/../../../site/hanzi.crazydan.io/public/assets/db.sqlite"

python "${GEN_PY_FILE}" \
    --db "${TARGET_DB_FILE}" \
    --eps 0.1 --stroke-sample-count 50000
