#!/usr/bin/env bash

set -o nounset
set -o errexit
set -o pipefail
set -o xtrace

remote=${REMOTE:-http://localhost:9595}

package=fictitious-lib
version=0.1.0

reference=${package}/${version}

# Preconditions
# =============
# 1. `github.token` exists in the current directory.
# 2. `oauth.json` exists in the current directory.

header() {
  set +o xtrace
  echo ================================================================== 1>&2
  echo $@ 1>&2
  echo ================================================================== 1>&2
  set -o xtrace
}

output=$(mktemp)
trap "rm -f ${output}" EXIT

# We only need to capture stderr.
capture() {
  set +o xtrace
  exec 4>&2 2> >(tee ${output})
  "$@"
  exec 2>&4
  set -o xtrace
}

expect() {
  grep --quiet "${1}" ${output}
}

build() {
  root="$(pwd)/tests/packages/executable"
  dir="$(mktemp -d)"
  trap "rm -rf ${dir}" RETURN
  pushd ${dir}
  conan install --output-folder . --remote cocoserver ${root}
  cmake -DCMAKE_TOOLCHAIN_FILE=conan_toolchain.cmake -DCMAKE_BUILD_TYPE=Release ${root}
  cmake --build .
  ./executable | tee ${output}
  expect 'answer? 42'
  popd
}

conan remote add cocoserver ${remote} --force

conan profile detect --force
conan remote auth cocoserver
logout="conan remote logout cocoserver"
export="conan create tests/packages/library"
remove_all="conan remove --confirm ${reference}"
remove_packages="${remove_all}:*"
upload_all="conan upload --remote cocoserver --confirm ${reference}"
upload_recipe="${upload_all} --only-recipe"
install="conan install --remote cocoserver --requires ${reference}"

header EXPORT TO CACHE
${export}
build

#header RESET
#if ! capture ${remove_all} --remote cocoserver; then
#  expect "ERROR: 404: Not Found."
#else
#  sleep 60
#fi

header TRY TO UPLOAD NON EXISTING RECIPE
conan export tests/packages/library --user nonexistinguser --channel nonexistingchannel
conan upload  --remote cocoserver ${reference}@nonexistinguser/nonexistingchannel --confirm --only-recipe --dry-run

header BUILD FROM SOURCE
${remove_packages} --remote cocoserver
${upload_recipe}
${remove_all}

! capture ${install}
expect "ERROR: Missing prebuilt package for '${reference}'" \
  || expect "ERROR: ${reference} was not found in remote 'cocoserver'"
${install} --build missing
build

header BUILD FROM BINARY
${upload_all}
${remove_all}

${install}
build

header BUILD FROM SOURCE AGAIN
${remove_packages} --remote cocoserver
${remove_all}

! capture ${install}
expect "ERROR: Missing prebuilt package for '${reference}'"
${install} --build missing
build

#header RE-REMOVE
#${remove_all} --remote cocoserver
#${remove_all}
#sleep 60
#! capture ${install} --build missing
#expect "ERROR: ${reference} was not found in remote 'cocoserver'" \
#  || expect "ERROR: Package '${reference}' not resolved"
#! capture ${remove_all} --remote cocoserver
#expect "ERROR: 404: Not Found."

header RE-UPLOAD
${export}
${upload_all}

${upload_all}

header UNAUTHENTICATED
${logout}
${remove_all}
${install}

header PASSED!
