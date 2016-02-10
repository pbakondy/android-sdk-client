#!/usr/bin/env node
'use strict';

const meow = require('meow');
const fn = require('./index.js');

const cli = meow(`

  Usage
    $ android-sdk-client <options>

  Options
    -h, --help      Display this help
    -e, --extended  Display extended list woth download URLs
    -s, --save      Save original XMLs locally to dir "export"
    -v, --version   Display version

`);

if (cli.flags.h) {
  cli.showHelp();
  process.exit(1);
}

fn(cli.flags);
