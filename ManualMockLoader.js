'use strict';

const path = require('path');
const fs = require('fs');

const LOADER_DELIMITER = '!';
const MOCKS_DIR_NAME = '__mocks__';

/**
 * A module is considered a package if a) it does not being with './',
 * '/' or '../' and b) it's in a `config.resolve.modulesDirectories` dir.
 * @param  {String}  loaderLessRawRequest The raw request (without loaders).
 * @param  {String}  resourcePath         The absolute resource path.
 * @param  {Array}   modulesDirectories   Array of module directories, e.g. 'node_modules',
 *                                        'web_modules' etc.
 * @return {Boolean}
 */
function isPackage(loaderLessRawRequest, resourcePath, modulesDirectories) {
    return modulesDirectories.some(dir => {
        return resourcePath.indexOf(dir) !== -1;
    }) && !['.', '/'].some(val => {
        return val === loaderLessRawRequest[0];
    });
}

function manualMockLoader(source) {

    const cwd = process.cwd();
    const request = this.request;
    const resourcePath = this.resourcePath;
    const dirName = path.dirname(resourcePath);
    const fileName = path.basename(resourcePath);
    const rawRequest = this._module.rawRequest;
    const rawRequestParts = rawRequest.split(LOADER_DELIMITER);
    const loaderLessRawRequest = rawRequestParts[rawRequestParts.length - 1];
    const modulesDirectories = this.options.resolve.modulesDirectories;

    let mockResourcePath;

    if (this.cacheable) {
        this.cacheable();
    }

    // If the module is considered a package entry file then mocks are expected to be in
    // cwd/__mocks__/**.
    // NOTE: not sure if this is the exact same behaviour as `node-haste`
    // https://github.com/facebook/jest/issues/509
    if (isPackage(loaderLessRawRequest, resourcePath, modulesDirectories)) {
        mockResourcePath = path.join(cwd, MOCKS_DIR_NAME, loaderLessRawRequest);
        if (!/\.js$/.test(mockResourcePath)) {
            mockResourcePath += '.js';
        }
    } else {
        mockResourcePath = path.join(dirName, MOCKS_DIR_NAME, fileName);
    }

    try {
        let stats = fs.statSync(mockResourcePath);
        if (stats.isFile()) {
            // Using '!!' (https://webpack.github.io/docs/loaders.html#loader-order) to disable all loaders
            // specified in config as the `request` already contains the absolute loader paths.
            source = 'jest._registerManualMock("!!' + request + '", "' +
                mockResourcePath + '");\n' + source;
        }
    } catch (e) {
        // Manual mock does not exist.
    }

    return source;
}

module.exports = manualMockLoader;
