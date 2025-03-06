#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail

conan=${CONAN:-1}
revisions=${REVISIONS:-True}
remote=${REMOTE:-http://localhost}
image=${IMAGE:-cocoserver}

test=${1:-./tests/test.sh}

sudo docker run --rm --interactive \
--mount type=bind,source=$(pwd),target=/root/cocoserver \
${image} <<EOF
pip3 install --upgrade conan==${conan}.*
cd cocoserver
PORT=80 VERBOSE=3 CONAN=${conan} REVISIONS=${revisions} REMOTE=${remote} \
  ./tests/serve.sh ${test}
EOF
