#!/bin/bash

set -x

BIN=node_modules/.bin
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DC="$DIR/docker-compose.yml"
PATH=$PATH:$DIR/.bin/
COMPOSE=$(which docker-compose)
MOCHA=$BIN/_mocha
COVER="$BIN/isparta cover"
NODE=$BIN/babel-node
COMPOSE_VER=${COMPOSE_VER:-1.7.1}
COMPOSE="docker-compose -f $DC"

if ! [ -x "$(which docker-compose)" ]; then
  mkdir $DIR/.bin
  curl -L https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-`uname -s`-`uname -m` > $DIR/.bin/docker-compose
  chmod +x $DIR/.bin/docker-compose
fi

trap "$COMPOSE logs redis-monitor; $COMPOSE stop; $COMPOSE rm -f -v;" EXIT

# bring compose up
$COMPOSE up -d

echo "cleaning old coverage"
rm -rf ./coverage

set -e

if [[ "$SKIP_REBUILD" != "1" ]]; then
  echo "rebuilding native dependencies..."
  docker exec tester npm rebuild
fi

echo "running tests & coverage"
docker exec tester /bin/sh -c "$NODE $COVER --dir ./coverage $MOCHA"

if [[ x"$CI" == x"true" ]]; then
  echo "uploading coverage report from ./coverage/lcov.info"
  $BIN/codecov -f ./coverage/lcov.info
fi
