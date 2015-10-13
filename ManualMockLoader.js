'use strict';

var path = require('path');
var fs = require('fs');
var loaderUtils = require('loader-utils');

/**
 * A module is considered a package if a) it does not begin with './',
 * '/' or '../' and b) it's in a `config.resolve.modulesDirectories` dir.
 */
function isPackage(rawRequest, resourcePath, modulesDirectories) {
    // Strip loaders
    var rawParts = rawRequest.split('!');
    rawRequest = rawParts[1] || rawParts[0];

    return modulesDirectories.some(function(dir) {
        return resourcePath.indexOf(dir) !== -1;
    }) && !['.', '/'].some(function(val) {
        return val === rawRequest[0];
    });
}

module.exports = function(source, sourceMap) {

    var cwd = process.cwd();
    var resourcePath = this.resourcePath;
    var dirName = path.dirname(resourcePath);
    var fileName = path.basename(resourcePath);
    var rawRequest = this._module.rawRequest;
    var absoluteMockPath;
    var stats;

    if (this.cacheable) {
        this.cacheable();
    }

    if (isPackage(rawRequest, resourcePath, this.options.resolve.modulesDirectories)) {
        absoluteMockPath = path.join(cwd, '__mocks__', rawRequest + '.js');
    } else {
        absoluteMockPath = path.join(dirName, '__mocks__', fileName);
    }

    try {
        stats = fs.statSync(absoluteMockPath);
        if (stats.isFile()) {
            source = 'jest._registerManualMock("' + resourcePath + '", "'
                + absoluteMockPath + '");\n' + source;
        }
    } catch (e) {
        // Manual mock does not exist.
    }

    return source;
};
