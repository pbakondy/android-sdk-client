# Android SDK Client

Display list of available files of SDK repository


## Install

```
$ npm install -g android-sdk-client
```

## Goal

The main goal is to reproduce the result of these `android` commands with download URLs.

```
android list sdk --all
android list sdk --all --extended
```

## Usage

```
$ android-sdk-client --help

  Usage
    $ android-sdk-client <options>

  Options
    -h, --help      Display this help
    -e, --extended  Display extended list with download URLs
    -o, --obsolete  Show obsolete items
    -s, --save      Save original XMLs locally to directory "export"
    -v, --version   Display version

```

List all items with download URLs:

```
$ android-sdk-client -e
```

## License

**android-sdk-client** is licensed under the MIT Open Source license. For more information, see the LICENSE file in this repository.
