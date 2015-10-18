'use strict';

var path = require('path');
var objectAssign = require('object-assign');

var PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json');
var DEFAULTS = {
    statsPath: '__bundled_tests__/stats.json',
    bundledTestsPattern: '__bundled_tests__/**',
    bundledTestsIgnorePattern: ''
};

/**
 * Reads the package json.
 * @return {Object} The package json.
 */
function getPackageJson() {
    var packageJson;
    var message;
    try {
        packageJson = require(PACKAGE_JSON_PATH);
    } catch (oh) {
        message = oh.message;
        oh.message = 'Cannot find package.json. \nError: ' + message;
        throw oh;
    }
    return packageJson;
}

/**
 * Reads the 'jestpack' config from package json.
 * @return {Object} The config.
 */
function getConfig() {
    var packageJson = getPackageJson();
    var config = packageJson.jestpack;
    var allowed = Object.keys(DEFAULTS);
    config = objectAssign({}, DEFAULTS, config);
    Object.keys(config).forEach(function(key) {
        if (allowed.indexOf(key) === -1) {
            throw new Error('Unknown config option: ' + key);
        }
    });
    return config;
}

module.exports = getConfig();
