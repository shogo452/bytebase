#!/bin/sh
# ===========================================================================
# File: build_bytebase
# Description: usage: ./build_bytebase [outdir]
# ===========================================================================

# exit when any command fails
set -e

cd "$(dirname "$0")/../"
. ./scripts/build_init.sh

OUTPUT_DIR=$(mkdir_output "$1")
OUTPUT_BINARY=$OUTPUT_DIR/bytebase

TARGET_GO_VERSION="1.23.4"
GO_VERSION=`go version | { read _ _ v _; echo ${v#go}; }`
if [ "$(version ${GO_VERSION})" -lt "$(version $TARGET_GO_VERSION)" ];
then
   echo "${RED}Precheck failed.${NC} Require go version >= $TARGET_GO_VERSION. Current version ${GO_VERSION}."; exit 1;
fi

NODE_VERSION=`node -v | { read v; echo ${v#v}; }`
if [ "$(version ${NODE_VERSION})" -lt "$(version 22.13.0)" ];
then
   echo "${RED}Precheck failed.${NC} Require node.js version >= 22.13.0. Current version ${NODE_VERSION}."; exit 1;
fi

if ! command -v npm > /dev/null
then
   echo "${RED}Precheck failed.${NC} npm is not installed."; exit 1;
fi

# Step 1 - Build the frontend release version into the backend/server/dist folder
# Step 2 - Build the monolithic app by building backend release version together with the backend/server/dist.
echo "Start building Bytebase monolithic ${VERSION}..."

echo ""
echo "Step 1 - building Bytebase frontend..."

rm -rf ./backend/server/dist

export BB_GIT_COMMIT_ID_FE=$(git rev-parse HEAD)
if command -v pnpm > /dev/null
then
   pnpm --dir ./frontend i && pnpm --dir ./frontend release
else
   npm --prefix ./frontend run release
fi

echo "Completed building Bytebase frontend."

echo ""
echo "Step 2 - building Bytebase backend..."

flags="-X 'github.com/bytebase/bytebase/backend/bin/server/cmd.version=${VERSION}'
-X 'github.com/bytebase/bytebase/backend/bin/server/cmd.goversion=$(go version)'
-X 'github.com/bytebase/bytebase/backend/bin/server/cmd.gitcommit=$(git rev-parse HEAD)'
-X 'github.com/bytebase/bytebase/backend/bin/server/cmd.buildtime=$(date -u +"%Y-%m-%dT%H:%M:%SZ")'
-X 'github.com/bytebase/bytebase/backend/bin/server/cmd.builduser=$(id -u -n)'"

CGO_ENABLED=1 go build -p=8 --tags "release,embed_frontend" -ldflags "-w -s $flags" -o ${OUTPUT_BINARY} ./backend/bin/server/main.go

echo "Completed building Bytebase backend."

echo ""
echo "Step 3 - printing version..."

${OUTPUT_BINARY} version

echo ""
echo "${GREEN}Completed building Bytebase monolithic ${VERSION} at ${OUTPUT_BINARY}.${NC}"
echo ""
echo "Command to start Bytebase on port 8080"
echo ""
echo "$ ${OUTPUT_BINARY} --port 8080${NC}"
echo ""
