'use strict';

var path = require('path');
var fs = require('fs');
var loaderUtils = require('loader-utils');

module.exports = function(source, sourceMap) {

    var dirName = path.dirname(this.resourcePath);
    var fileName = path.basename(this.resourcePath);
    var absoluteMockPath = path.join(dirName, '__mocks__', fileName);
    var stats;
    var relativeModulePath;
    var relativeMockPath;

    if (this.cacheable) {
        this.cacheable();
    }
        
    try {
        stats = fs.statSync(absoluteMockPath);
        if (stats.isFile()) {
            relativeModulePath = './' + fileName;
            relativeMockPath = './__mocks__/' + fileName;
            source = 'jest.dontMock("' + relativeMockPath + '");\njest.setMock("' + relativeModulePath + '", require("' + relativeMockPath + '"));\n' + source;
        } else {

        }
    } catch (e) {
        // Manual mock not found.
    };

    return source;
};
