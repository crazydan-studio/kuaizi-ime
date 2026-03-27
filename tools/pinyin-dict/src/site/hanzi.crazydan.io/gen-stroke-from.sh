#!/bin/bash
_DIR_="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

ROOT_DIR="$(cd "${_DIR_}/../../.." && pwd -P)"

GEN_PY_FILE="${ROOT_DIR}/src/data/word/stroke/gen-from-gif.py"
GEN_PY_GRID_MASK_FILE="${ROOT_DIR}/src/data/word/stroke/assets/extra-mask.png"

TARGET_ZI_ASSET_DIR="${ROOT_DIR}/../../site/hanzi.crazydan.io/public/assets/zi"

for gif in "$@"; do
    unicode="$(basename "$(dirname "${gif}")")"
    target="${TARGET_ZI_ASSET_DIR}/${unicode}/stroke.svg"

    if [[ ! -f "${target}" ]]; then
        mkdir -p "$(dirname "${target}")"

        python "${GEN_PY_FILE}" \
            --grid-matting-mask "${GEN_PY_GRID_MASK_FILE}" \
            --stroke-hsv-range 130,40,40,178,255,255 \
            --stroke-mask-sigma 0 --stroke-contour-sigma 1 \
            --grid-scale 8 --stroke-min-area 80 --stroke-simplify 2.5 \
            --stroke-anim-duration 0 --stroke-anim-frames 10 \
            --log-label "${unicode}" \
            --input "${gif}" \
            --anim-output "${target}"
    fi
done
