#!/bin/bash
set -e

cd /home/runner/workspace
yarn install --inline-builds 2>&1
