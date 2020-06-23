#!/usr/bin/env bash

export CODE_TESTS_PATH="$(pwd)/client/out/test"
export CODE_TESTS_WORKSPACE="$(pwd)/client/src/test/testFixture"

node "$(pwd)/client/out/test/runTest"