#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
mkdir -p tmp/tests
g++ -std=c++11 -Wall -Wextra -Werror -fsanitize=address,undefined -g \
  'ESP-32 Code/tests/positioning_test.cpp' -o tmp/tests/positioning_test
tmp/tests/positioning_test
g++ -std=c++11 -Wall -Wextra -Werror -fsanitize=address,undefined -g \
  'ESP-32 Code/tests/tracking_test.cpp' -o tmp/tests/tracking_test
tmp/tests/tracking_test
