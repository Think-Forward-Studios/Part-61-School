#!/bin/sh
# Source this file in any shell to make node/pnpm available.
#   . scripts/dev-env.sh
# Or prefix commands:
#   sh -c '. scripts/dev-env.sh && pnpm install'
export PNPM_HOME="$HOME/.local/pnpm"
export PATH="$PNPM_HOME:/usr/local/bin:$PATH"
