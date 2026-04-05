#!/bin/bash
_DIR_="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

ROOT_DIR="$(cd "${_DIR_}/../../.." && pwd -P)"

GEN_PY_FILE="${_DIR_}/lib/stroke-similarity.py"

TARGET_DB_FILE="${ROOT_DIR}/../../../site/hanzi.crazydan.io/public/assets/db.sqlite"
TARGET_DB_LOCK_FILE="${TARGET_DB_FILE}.lck"

# 创建数据库写加锁文件
touch "${TARGET_DB_LOCK_FILE}"


# -----------------------------------------------
# - 第一阶段配置：--cluster-eps 0.05 --cluster-min-size 50
# -----------------------------------------------
python "${GEN_PY_FILE}" \
    --db "${TARGET_DB_FILE}" \
    --stroke-sample-count 50000 \
    --cluster-eps 0.05 --cluster-min-size 50


rm -f "${TARGET_DB_LOCK_FILE}"
