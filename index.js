#!/usr/bin/env node
'use strict';

const CONFIG = require('./package.json');

const fs = require('fs');
const url = require('url');
const path = require('path');
const process = require('process');

const Promise = require('es6-promise').Promise;
// http://www.html5rocks.com/en/tutorials/es6/promises/

const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const axios = require('axios');
const mkdirp = require('mkdirp');
const humanize = require('humanize');

const EXPORT_PATH = path.join(process.cwd(), 'export');

const SYSTEM_IMAGE_NAMES = {
  'armeabi-v7a': 'ARM EABI v7a System Image',
  'arm64-v8a': 'ARM 64 v8a System Image',
  'x86': 'Intel x86 Atom System Image',
  'x86_64': 'Intel x86 Atom_64 System Image',
  'mips': 'MIPS System Image'
};

var detailedList = false;
var exportFiles = false;
var showObsolete = false;

var repositories = [
  { url: 'https://dl.google.com/android/repository/repository-11.xml', name: 'SDK Repository' },
  { url: 'https://dl.google.com/android/repository/addons_list-2.xml', name: 'Add-ons List' }
];
var addons = [];



function getUrlFilename(urlStr) {
  var parsed = url.parse(urlStr);
  return parsed.pathname;
}


function parse(httpResult) {
  return new Promise(function(resolve, reject) {
    console.log('Parse XML:   ', httpResult.config.url);
    parser.parseString(httpResult.data, function (err, result) {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}


/**
 * Write out original XML and parsed JSON to file
 */
function exportSources(data, source) {
  if (exportFiles) {
    var outfileXml = path.join(EXPORT_PATH, getUrlFilename(source.url));
    // replace file extension
    var outfileJson = path.join(path.dirname(outfileXml), path.basename(outfileXml, path.extname(outfileXml)) + '.json');
    mkdirp(path.dirname(outfileXml), function () {
      fs.writeFile(outfileXml, source.xml.data);
      fs.writeFile(outfileJson, JSON.stringify(source.data, null, '  '));
    });
  }

  return source;
}


function getRevisionString(revision) {
  if (!revision) return '';
  if (!revision[0]) return '';

  if (typeof revision[0] === 'string') {
    return '' + parseInt(revision[0], 10);
  }

  let major = revision[0] && revision[0]['sdk:major'] && revision[0]['sdk:major'][0]
    ? parseInt(revision[0]['sdk:major'][0], 10) : 0;
  let minor = revision[0] && revision[0]['sdk:minor'] && revision[0]['sdk:minor'][0]
    ? parseInt(revision[0]['sdk:minor'][0], 10) : 0;
  let micro = revision[0] && revision[0]['sdk:micro'] && revision[0]['sdk:micro'][0]
    ? parseInt(revision[0]['sdk:micro'][0], 10) : 0;
  let preview = revision[0] && revision[0]['sdk:preview'] && revision[0]['sdk:preview'][0]
    ? parseInt(revision[0]['sdk:preview'][0], 10) : 0;

  if (!major) return '';

  let out = major;
  if (minor || micro) {
    out += `.${minor}`;
  }
  if (micro !== 0) {
    out += `.${micro}`;
  }
  if (preview) {
    out += ` rc${preview}`;
  }
  return out;
}


function printData(data, baseUrl, type, name) {

  try {
    let obsoleteItem = !!data['sdk:obsolete'];

    if (!showObsolete && obsoleteItem) {
      return;
    }

    let obsoleteString = obsoleteItem ? ' (Obsolete)' : '';
    let version = data['sdk:version'] ? data['sdk:version'][0] : '';
    let sdkApiLevel = data['sdk:api-level'] ? data['sdk:api-level'][0] : '';
    let sdkRevision = data['sdk:revision'] ? getRevisionString(data['sdk:revision']) : '';
    let nameDisplay = data['sdk:name-display'] ? data['sdk:name-display'][0] : '';
    let path = data['sdk:path'] ? data['sdk:path'][0] : '';
    let abi = data['sdk:abi'] ? data['sdk:abi'][0] : '';

    let description;
    let extraDescription;
    let pathDescription;
    let requires;
    if (data['sdk:description']) {
      description = data['sdk:description'][0].trim();
    } else if (type === 'Sample') {
      description = 'Samples for SDK API ' + sdkApiLevel + ', revision ' + sdkRevision;
    } else if (type === 'PlatformTool') {
      description = 'Android SDK Platform-tools, revision ' + sdkRevision;
    } else if (type === 'BuildTool') {
      description = 'Android SDK Build-tools, revision ' + sdkRevision;
    } else if (type === 'Tool') {
      description = 'Android SDK Tools, revision ' + sdkRevision;
    } else if (type === 'Doc') {
      description = `Documentation for Android SDK, API ${sdkApiLevel}, revision ${sdkRevision}`;
    } else if (type === 'Source') {
      description = `Sources for Android SDK, API ${sdkApiLevel}, revision ${sdkRevision}`;
    }

    if (type === 'Addon') {
      extraDescription = description;
      description = `${nameDisplay}, Android API ${sdkApiLevel}, revision ${sdkRevision}`;
      requires = `Requires SDK Platform Android API ${sdkApiLevel}`;
    }
    if (type === 'Extra') {
      extraDescription = description;
      description = `${nameDisplay}, revision ${sdkRevision}`;
      pathDescription = `Install path: extras/android/${path}`;
    }
    if (type === 'SystemImage') {
      extraDescription = SYSTEM_IMAGE_NAMES[abi] ? SYSTEM_IMAGE_NAMES[abi] : abi;
      requires = `Requires SDK Platform Android API ${sdkApiLevel}`;
    }

    description += obsoleteString;

    let vendorDisplay = data['sdk:vendor-display'] ? 'by ' + data['sdk:vendor-display'][0] : '';

    if (detailedList) {
      console.log('------------');
      console.log('    Type: ' + type);
      console.log('    Desc: ' + description);
      if (version) {
        console.log('          Version ' + version);
      }
      if (sdkApiLevel) {
        console.log('          API ' + sdkApiLevel);
      }
      if (sdkRevision) {
        console.log('          Revision ' + sdkRevision);
      }
      if (vendorDisplay) {
        console.log('          ' + vendorDisplay);
      }
      if (extraDescription) {
        console.log('          ' + extraDescription);
      }
      if (pathDescription) {
        console.log('          ' + pathDescription);
      }
      if (requires) {
        console.log('          ' + requires);
      }

      data['sdk:archives'][0]['sdk:archive'].forEach(arch => {
        let os = arch['sdk:host-os'] ? arch['sdk:host-os'][0] : 'download';
        let downloadUrl = url.resolve(baseUrl, arch['sdk:url'][0]);
        let size = parseInt(arch['sdk:size'][0], 10);
        let checksum = arch['sdk:checksum'][0]._;
        let checksumType = arch['sdk:checksum'][0].$.type;
        console.log(new Array(9 - os.length).join(' ') + os + ': ' + downloadUrl);
        console.log('          size: ' + humanize.filesize(size));
        console.log('          ' + checksumType + ': ' + checksum);
      });

    } else {
      let out = ` - ${name}, revision ${getRevisionString(data['sdk:revision'])}${obsoleteString}`;
      console.log(out);
    }
  } catch(e) {
    console.error(e);
  }
}


function printDetails(data, source) {
  try {
    if (source.data['sdk:sdk-repository']) {
      if (source.data['sdk:sdk-repository']['sdk:platform']) {
        source.data['sdk:sdk-repository']['sdk:platform'].forEach(item => {
          let version = item['sdk:version'] ? item['sdk:version'][0] : '';
          printData(item, source.url, 'Platform', `SDK Platform Android ${version}`);
        });
      }
      if (source.data['sdk:sdk-repository']['sdk:sample']) {
        source.data['sdk:sdk-repository']['sdk:sample'].forEach(item => {
          let sdkApiLevel = item['sdk:api-level'] ? item['sdk:api-level'][0] : '';
          printData(item, source.url, 'Sample', `Samples for SDK API ${sdkApiLevel}`);
        });
      }
      if (source.data['sdk:sdk-repository']['sdk:platform-tool']) {
        source.data['sdk:sdk-repository']['sdk:platform-tool'].forEach(item => {
          printData(item, source.url, 'PlatformTool', 'Android SDK Platform-tools');
        });
      }
      if (source.data['sdk:sdk-repository']['sdk:build-tool']) {
        source.data['sdk:sdk-repository']['sdk:build-tool'].forEach(item => {
          printData(item, source.url, 'BuildTool', 'Android SDK Build-tools');
        });
        if (source.data['sdk:sdk-repository']['sdk:tool']) {
          source.data['sdk:sdk-repository']['sdk:tool'].forEach(item => {
            printData(item, source.url, 'Tool', 'Android SDK Tools');
          });
        }
        if (source.data['sdk:sdk-repository']['sdk:doc']) {
          source.data['sdk:sdk-repository']['sdk:doc'].forEach(item => {
            let sdkApiLevel = item['sdk:api-level'] ? item['sdk:api-level'][0] : '';
            printData(item, source.url, 'Doc', `Documentation for Android SDK, API ${sdkApiLevel}`);
          });
        }
        if (source.data['sdk:sdk-repository']['sdk:source']) {
          source.data['sdk:sdk-repository']['sdk:source'].forEach(item => {
            let sdkApiLevel = item['sdk:api-level'] ? item['sdk:api-level'][0] : '';
            printData(item, source.url, 'Source', `Sources for Android SDK, API ${sdkApiLevel}`);
          });
        }
      }
    }

    if (source.data['sdk:sdk-addon']) {
      if (source.data['sdk:sdk-addon']['sdk:add-on']) {
        source.data['sdk:sdk-addon']['sdk:add-on'].forEach(item => {
          let nameDisplay = item['sdk:name-display'] ? item['sdk:name-display'][0] : '';
          let sdkApiLevel = item['sdk:api-level'] ? item['sdk:api-level'][0] : '';
          printData(item, source.url, 'Addon', `${nameDisplay}, Android API ${sdkApiLevel}`);
        });
      }
      if (source.data['sdk:sdk-addon']['sdk:extra']) {
        source.data['sdk:sdk-addon']['sdk:extra'].forEach(item => {
          let nameDisplay = item['sdk:name-display'] ? item['sdk:name-display'][0] : '';
          printData(item, source.url, 'Extra', nameDisplay);
        });
      }
    }

    if (source.data['sdk:sdk-sys-img']) {
      if (source.data['sdk:sdk-sys-img']['sdk:system-image']) {
        source.data['sdk:sdk-sys-img']['sdk:system-image'].forEach(item => {

          let abi = item['sdk:abi'] ? item['sdk:abi'][0] : '';
          let abiName = SYSTEM_IMAGE_NAMES[abi] ? SYSTEM_IMAGE_NAMES[abi] : abi;
          let sdkApiLevel = item['sdk:api-level'] ? item['sdk:api-level'][0] : '';
          printData(item, source.url, 'SystemImage', `${abiName}, Android API ${sdkApiLevel}`);
        });
      }
    }

  } catch(e) {
    console.error(e, data, source);
  }

  return source;
}


function getAndParse(source) {
  return new Promise(function(resolve, reject) {
    console.log('Fetching URL:', source.url);
    axios.get(source.url)
      .then(data => { source.xml = data; return data; })
      .then(parse)
      .then(data => { source.data = data; return data; })
      .then(data => exportSources(data, source))
    // .then(data => printDetails(data, source))
      .then(resolve)
      .catch(reject);
  });
}


function getData() {
  getRepositoryData()
    .then(() => getAddonsData())
    .catch(err => console.log(err))
    .then(() => { console.log('Done loading packages.'); printList(); });
}


function getRepositoryData() {
  return new Promise(function(resolve, reject) {
    var list = [];
    repositories.forEach(source => list.push(getAndParse(source)));
    Promise.all(list).then(() => {
      // fill addons list
      try {
        repositories[1].data['sdk:sdk-addons-list']['sdk:addon-site']
          .forEach(addon => addons.push({
            url: url.resolve(repositories[1].url, addon['sdk:url'][0]),
            name: addon['sdk:name'][0]
          }));
      } catch (e) {
        console.log(e);
      }
      try {
        repositories[1].data['sdk:sdk-addons-list']['sdk:sys-img-site']
          .forEach(addon => addons.push({
            url: url.resolve(repositories[1].url, addon['sdk:url'][0]),
            name: addon['sdk:name'][0]
          }));
      } catch (e) {
        console.log(e);
      }
      resolve();
    }, reject);
  });
}


function getAddonsData() {
  return new Promise(function(resolve, reject) {
    var list = [];
    addons.forEach(source => list.push(getAndParse(source)));
    Promise.all(list).then(resolve, reject);
  });
}


function printList() {

  repositories.forEach(repo => {
    printDetails(null, repo);
  });
  addons.forEach(repo => {
    printDetails(null, repo);
  });

}


// http://www.2ality.com/2016/04/unhandled-rejections.html
process.on('unhandledRejection', (reason) => {
  console.log('unhandledRejection');
  console.log('Reason: ' + reason);
});


module.exports = function(options) {
  if (options.v || options.version) {
    console.log(CONFIG.version);
    return;
  }

  detailedList = options.e || options.extended;
  exportFiles = options.s || options.save;
  showObsolete = options.o || options.obsolete;

  getData();
};
