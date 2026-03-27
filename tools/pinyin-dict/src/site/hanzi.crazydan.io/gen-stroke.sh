#!/bin/bash
_DIR_="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

ROOT_DIR="$(cd "${_DIR_}/../../.." && pwd -P)"

GEN_SH_FILE="${_DIR_}/gen-stroke-from.sh"

SOURCE_ZI_MEDIA_DIR="${ROOT_DIR}/data/medias/zi"

# -P 0 表示自动控制并发进程数
# -n 1 表示每个进程只接受一个参数
find "${SOURCE_ZI_MEDIA_DIR}" -name 'stroke-demo.gif' -print0 \
    | xargs -0 -P 15 -n 10 bash "${GEN_SH_FILE}"
