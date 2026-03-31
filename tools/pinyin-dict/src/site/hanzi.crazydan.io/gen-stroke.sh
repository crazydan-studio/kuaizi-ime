#!/bin/bash
_DIR_="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

ROOT_DIR="$(cd "${_DIR_}/../../.." && pwd -P)"

GEN_SH_FILE="${_DIR_}/stroke/gen-from.sh"

SOURCE_ZI_MEDIA_DIR="${ROOT_DIR}/../../site/hanzi.crazydan.io/public/assets/zi"

# -P 0 表示自动控制并发进程数
# -n 1 表示每个进程只接受一个参数
find "${SOURCE_ZI_MEDIA_DIR}" -name 'stroke-demo.gif' -print0 \
    | xargs -0 -P 15 -n 100 bash "${GEN_SH_FILE}" "${SOURCE_ZI_MEDIA_DIR}"


##########################################################################

# 繁体字笔画图实际需采用简体字的笔画图
tradStrokes=(
    # trad:simp
    'U+5DD3:U+5DD4' # 巓:巔
)
for pair in "${tradStrokes[@]}"; do
    trad="$(echo $pair | awk -F: '{print $1}')"
    simp="$(echo $pair | awk -F: '{print $2}')"

    if [[ ! -f "${SOURCE_ZI_MEDIA_DIR}/${trad}/stroke_tc.svg" ]]; then
        mv "${SOURCE_ZI_MEDIA_DIR}/${trad}/stroke.svg" \
            "${SOURCE_ZI_MEDIA_DIR}/${trad}/stroke_tc.svg"

        mv "${SOURCE_ZI_MEDIA_DIR}/${simp}/stroke.svg" \
            "${SOURCE_ZI_MEDIA_DIR}/${trad}/stroke.svg"
    fi
done

# 去掉使用了对应繁体字笔画的笔画图
errorStrokes=(
    'U+507D' # 偽 -> 僞(U+50DE)
    'U+70BA' # 為 -> 爲(U+7232)
    'U+5DD4' # 巔 -> 巓(U+5DD3)
)
for s in "${errorStrokes[@]}"; do
    rm -f "${SOURCE_ZI_MEDIA_DIR}/${s}"/stroke*
done
