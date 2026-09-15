#!/bin/bash

podman run --rm -it \
    -w /workspace \
    -v /usr/share/fontconfig:/usr/share/fontconfig \
    -v /usr/share/fonts:/usr/share/fonts \
    -v `pwd`:/workspace \
    studio.crazydan.org/nodejs \
    bash
