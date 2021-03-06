#!/usr/bin/env bash

set -e

set +e
yarn test-selenium-3-chrome --coverage --runInBand --forceExit
test_results=$?
set -e

yarn codecov -F selenium3chrome
exit ${test_results:=0}
