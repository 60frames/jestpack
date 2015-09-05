'use strict';

// node-debug --nodejs --harmony node_modules/.bin/jest --runInBand

var fs = require('fs');
var HasteModuleLoader = require('jest-cli/src/HasteModuleLoader/HasteModuleLoader');
var moduleMocker = require('jest-cli/src/lib/moduleMocker');
var webpackStats;

// TODO: Option out stats location, `config.webpackStatsPath`, taking into account
// <rootDir>. Will need to use another key in 'package.json' as Jest throws
// if an unrecognised key exists...
try {
    webpackStats = require(path.resolve(process.cwd(), './__tests__/stats.json'));
} catch (oh) {
    var message = oh.message;
    oh.message = 'Cannot find Webpack stats. \nError: ' + message;
    throw oh;
}

/**
 * Adds support for Webpack's internal `__webpack_require__` module loader. Designed
 * to replace the default `HasteModuleLoader` used by Jest.
 * @constructor
 * @extends {HasteModuleLoader}
 */
function ModuleLoader() {
    HasteModuleLoader.apply(this, arguments);
}

ModuleLoader.prototype = Object.create(HasteModuleLoader.prototype);

ModuleLoader.prototype.constructor = ModuleLoader;

/**
 * Patch the Jest runtime to support Webpack's internal module loader.
 * @override
 */
ModuleLoader.prototype.resetModuleRegistry = function() {
    HasteModuleLoader.prototype.resetModuleRegistry.apply(this, arguments);
    // This might not always exist at this point in time...
    this._environment.global.installedModules = {};
    var _superRuntime = this._builtInModules['jest-runtime'];
    this._builtInModules['jest-runtime'] = function() {
        var runtime = _superRuntime.apply(this, arguments);
        this._patchJestRuntime(runtime);
        return runtime;
    }.bind(this);
};

/**
 * Updates Jest runtime to accept Webpack module Ids instead of Haste paths.
 */
ModuleLoader.prototype._patchJestRuntime = function(runtime) {

    runtime.exports.dontMock = function(moduleId) {
        this._explicitShouldMock[moduleId] = false;
        return runtime.exports;
    }.bind(this);

    runtime.exports.genMockFromModule = function(moduleId) {
        return this._generateMock(moduleId);
    }.bind(this);

    runtime.exports.mock = function(moduleId) {
        this._explicitShouldMock[moduleId] = true;
        return runtime.exports;
    }.bind(this);

    runtime.exports.setMock = function(moduleId, moduleExports) {
        this._explicitShouldMock[moduleId] = true;
        this._explicitlySetMocks[moduleId] = moduleExports;
        return runtime.exports;
    }.bind(this);

    /**
     * This is the 'patched' require passed around in the compiled Webpack build
     * as `__webpack_require__`.
     * @override
     */
    runtime.exports.__webpack_require__ = function(moduleId) {
        return this._webpackRequireModuleOrMock(moduleId);
    }.bind(this);

};

/**
 * Requires either the module or mock.
 * @param  {Number} moduleId The Webpack moduleId.
 * @return {*}               The module or mock.
 */
ModuleLoader.prototype._webpackRequireModuleOrMock = function(moduleId) {
    if (this._shouldMock(moduleId)) {
        return this._webpackRequireMock(moduleId);
    } else {
        return this._webpackRequireModule(moduleId);
    }
};

/**
 * Requires the webpack module.
 * @param  {Number} moduleId The Webpack moduleId.
 * @return {*}               The module.
 */
ModuleLoader.prototype._webpackRequireModule = function(moduleId) {
    var __webpack_require__ = this._environment.global.__webpack_require__;
    
    if (!__webpack_require__) {
        throw new Error('`__webpack_require__` has not been defined in the JSDom environment.');
    }

    return __webpack_require__.apply(void 0, arguments);
};

/**
 * Requires a mocked version of the module.
 * @param  {Number} moduleId The Webpack moduleId. 
 * @return {*}               The mock.
 */
ModuleLoader.prototype._webpackRequireMock = function(moduleId) {

    if (this._explicitlySetMocks.hasOwnProperty(moduleId)) {
        return this._explicitlySetMocks[moduleId];
    }

    if (this._mockRegistry.hasOwnProperty(moduleId)) {
        return this._mockRegistry[moduleId];
    }

    this._mockRegistry[moduleId] = this._generateMock(moduleId);
    return this._mockRegistry[moduleId];
};

/**
 * Generates a mock from a given module.
 * @override
 */
ModuleLoader.prototype._generateMock = function(moduleId) {

    var origMockRegistry;
    var origModuleRegistry;
    var module;

    if (!this._mockMetaDataCache.hasOwnProperty(moduleId)) {
        // This allows us to handle circular dependencies while generating an
        // automock.
        this._mockMetaDataCache[moduleId] = moduleMocker.getMetadata({});

        // In order to avoid it being possible for automocking to potentially cause
        // side-effects within the module environment, we need to execute the module
        // in isolation. This accomplishes that by temporarily clearing out the
        // module and mock registries while the module being analyzed is executed.
        //
        // An example scenario where this could cause issue is if the module being
        // mocked has calls into side-effectful APIs on another module.
        origMockRegistry = this._mockRegistry;
        origModuleRegistry = this._environment.global.installedModules;
        this._mockRegistry = {};
        this._environment.global.installedModules = {};

        module = this._webpackRequireModule(moduleId);

        // Restore the "real" module/mock registries
        this._mockRegistry = origMockRegistry;
        this._environment.global.installedModules = origModuleRegistry;

        this._mockMetaDataCache[moduleId] = moduleMocker.getMetadata(module);
    }

    return moduleMocker.generateFromMetadata(this._mockMetaDataCache[moduleId]);
};

/**
 * Determines whether a particular module should be mocked or not.
 * TODO: Handle manual mocks; they will need to be built into the bundle.
 * @param  {Number}  moduleId The Webpack moduleId.
 * @return {Boolean}
 */
ModuleLoader.prototype._shouldMock = function(moduleId) {

    // Never mock the entry module.
    if (moduleId === 0) {
        return false;
    }

    if (this._explicitShouldMock.hasOwnProperty(moduleId)) {
        return this._explicitShouldMock[moduleId];
    }

    if (this._shouldAutoMock) {
        if (!this._configShouldMockModuleNames.hasOwnProperty(moduleId)
            && this._unmockListRegExps.length > 0) {
            this._configShouldMockModuleNames[moduleId] = !this._doesMatchUnmockListRegExps(moduleId);
        }
        return !!this._configShouldMockModuleNames[moduleId];
    }

    return false;
};

/**
 * Checks the module path against the paths defined in `config.unmockedModulePathPatterns`.
 * @param  {Number}  moduleId The Webpack moduleId.
 * @return {Boolean}
 */
ModuleLoader.prototype._doesMatchUnmockListRegExps = function(moduleId) {

    var modulePath = this._getModulePathFromModuleId(moduleId);
    var unmockRegExp;

    for (var i = 0; i < this._unmockListRegExps.length; i++) {
        unmockRegExp = this._unmockListRegExps[i];
        if (unmockRegExp.test(modulePath)) {
            return true;
        }
    }

    return false;
};

/**
 * Given the Webpack `moduleId` returns the module path.
 * @param  {Number} moduleId The Webpack moduleId.
 * @return {String}          The module path. NOTE: This may contain the Webpack
 *                           loader path.
 */
ModuleLoader.prototype._getModulePathFromModuleId = function(moduleId) {
    var identifier = webpackStats.modules[moduleId].identifier;
    return identifier;
};

ModuleLoader.loadResourceMap = HasteModuleLoader.loadResourceMap;

ModuleLoader.loadResourceMapFromCacheFile = HasteModuleLoader.loadResourceMap;

module.exports = ModuleLoader;
