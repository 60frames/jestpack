'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var Promise = require('bluebird');
var glob = require('glob');
var moduleMocker = require('jest-cli/src/lib/moduleMocker');
var utils = require('jest-cli/src/lib/utils');
var jest = require('jest-cli/src/jest');
var semver = require('semver');
var config = require('./config');

var _configUnmockListRegExpCache = null;
var webpackStats;

try {
    webpackStats = require(path.join(process.cwd(), config.statsPath));
} catch (oh) {
    var message = oh.message;
    oh.message = 'Cannot find Webpack stats. \nError: ' + message;
    throw oh;
}

/**
 * Builds simple resource map containing only the bundled test files.
 * @return {Promise} The 'node-haste'(ish) resource map.
 */
function loadSimpleResourceMap() {
    return new Promise(function(resolve, reject) {
        glob(config.bundledTestsPattern, {
            ignore: config.bundledTestsIgnorePattern
        }, function (err, files) {
            var resourceMap;
            if (err) {
                reject(err);
            } else {
                resourceMap = {
                    resourcePathMap: {}
                };
                files.forEach(function(file) {
                    var fullPath = path.resolve(file);
                    resourceMap.resourcePathMap[fullPath] = {
                        path: fullPath
                    };
                });
                resolve(resourceMap);
            }
        });
    });
}

/**
 * Adds support for Webpack's internal `__webpack_require__` module loader. Designed
 * to replace the default `HasteModuleLoader` used by Jest.
 * @constructor
 */
function JestModuleLoader(config, environment, resourceMap) {
    this._config = config;
    this._environment = environment;
    this._explicitShouldMock = {};
    this._explicitlySetMocks = {};
    this._mockMetaDataCache = {};
    this._resourceMap = resourceMap;
    this._shouldAutoMock = true;
    this._configShouldMockModuleNames = {};
    this._requiringActual = false;
    this._manualMockMap = {};

    if (_configUnmockListRegExpCache === null) {
        // Node must have been run with --harmony in order for WeakMap to be
        // available prior to version 0.12
        if (typeof WeakMap !== 'function') {
            throw new Error(
                'Please run node with the --harmony flag! jest requires WeakMap ' +
                'which is only available with the --harmony flag in node < v0.12'
            );
        }

        _configUnmockListRegExpCache = new WeakMap();
    }

    if (!config.unmockedModulePathPatterns
        || config.unmockedModulePathPatterns.length === 0) {
        this._unmockListRegExps = [];
    } else {
        this._unmockListRegExps = _configUnmockListRegExpCache.get(config);
        if (!this._unmockListRegExps) {
            this._unmockListRegExps = config.unmockedModulePathPatterns
                .map(function(unmockPathRe) {
                    return new RegExp(unmockPathRe);
                });
            _configUnmockListRegExpCache.set(config, this._unmockListRegExps);
        }
    }

    this.resetModuleRegistry();
}

JestModuleLoader.loadResourceMap = loadSimpleResourceMap;

// NOTE: Currently doesn't implement cache file, not sure if 'glob' supports this or if
// a fs.stats obj will need to be manually stored.
JestModuleLoader.loadResourceMapFromCacheFile = loadSimpleResourceMap;

// TODO: need to think about how `setupEnvScriptFile` and `setupTestFrameworkScriptFile`
// will work as the 'jest-runtime' depends on the Webpack runtime (i.e. __webpack_require__)
// and so running these setup files before then won't work.
JestModuleLoader.prototype.constructBoundRequire = function(sourceModulePath) {
    return function () {
        throw new Error('`JestModuleLoader` does not implement `require` for modules outside of Webpack.');
    };
};

/**
 * Coverage would likely make more sense as a Webpack loader.
 * https://github.com/deepsweet/istanbul-instrumenter-loader?
 * Although I wonder what implications there are when we run tests with a bundle
 * per test file (i.e. lot's of duplicated code).
 */
JestModuleLoader.prototype.getAllCoverageInfo = function() {
    throw new Error('\'JestModuleLoader\' does not implement coverage.');
};

JestModuleLoader.prototype.getCoverageForFilePath = function(filePath) {
    throw new Error('\'JestModuleLoader\' does not implement coverage.');
};

JestModuleLoader.prototype.getDependenciesFromPath = function(modulePath) {
    throw new Error('\'JestModuleLoader\' does not implement coverage.');
};

// TODO: Investigate this method further (it's called from TestRunner).
JestModuleLoader.prototype.getDependentsFromPath = function(modulePath) {
    return [];
};

// Pretty certain this doesn't need to be public, it's only exposed on `require.requireMock`
// which `JestModuleLoader` will handle via `jest._webpackRequire.requireMock`.
JestModuleLoader.prototype.requireMock = function(currPath, moduleName) {
    throw new Error('\'JestModuleLoader\' does not implement `requireMock` for modules outside of Webpack.');
};

/**
 * We only use `requireModule` to require in the initial bundled test files
 * as well as built in modules (i.e. 'jest-runtime'). All other modules are handled
 * by Webpack which means this can be greatly simplified vs `HasteModuleLoader`.
 * This means the `currPath` always === `moduleName` and `bypassRegistryCache` is
 * not applicable.
 *                        
 * @param  {String}  currPath            The path of the file that is attempting to
 *                                       resolve the module.
 * @param  {String}  moduleName          The name of the module to be resolved.
 * @param  {Boolean} bypassRegistryCache Whether we should read from/write to the module
 *                                       registry.
 * @return {Object}
 */
JestModuleLoader.prototype.requireModule = function(currPath, moduleName) {

    var moduleObj;

    if (moduleName && this._builtInModules.hasOwnProperty(moduleName)) {
        moduleObj = this._builtInModules[moduleName](currPath);
    } else {
        moduleObj = {
            __filename: currPath,
            exports: {}
        };
        this._execModule(moduleObj);
    }

    return moduleObj.exports;
};

/**
 * Given the `moduleObj` holding the module path the file is evaluated in the
 * bound JSDom env.
 * @param  {Object}    moduleObj The module obj.
 * @return {Undefined}           The `moduleObj` is mutated as a result
 *                               of this method.
 */
JestModuleLoader.prototype._execModule = function(moduleObj) {

    var modulePath = moduleObj.__filename,
        moduleLocalBindings = {
            // `module`, `exports`, `require`, `__dirname` and `__filename` aren't
            // necessary here as we're only executing a Webpack bundle.
            global: this._environment.global,
            jest: this._builtInModules['jest-runtime'](modulePath).exports
        };

    // Might as well support 0.4.x and 0.5.x in order to support Node 0.10.x and 4.0.x
    // https://github.com/facebook/jest/commit/eb2eaee1b6d882f529030e2f2a1c974f39fba1e1
    if (semver.lt(jest.getVersion(), '0.5.0')) {
        utils.runContentWithLocalBindings(
            this._environment.runSourceText.bind(this._environment),
            fs.readFileSync(modulePath, 'utf8'),
            modulePath,
            moduleLocalBindings
        );
    } else {
        utils.runContentWithLocalBindings(
            this._environment,
            fs.readFileSync(modulePath, 'utf8'),
            modulePath,
            moduleLocalBindings
        );
    }
};

// This is bound to the require in HasteModuleLoader, `JestModuleLoader` handles
// this with `jest._webpackRequire`.
JestModuleLoader.prototype.requireModuleOrMock = function(currPath, moduleName) {
    throw new Error('\'JestModuleLoader\' does not implement `requireModuleOrMock` for modules outside of Webpack.');
};

/**
 * Returns the Jest runtime.
 * @param  {String} dir Has no use in `JestModuleLoader`.
 * @return {Object}     The Jest runtime.
 */
JestModuleLoader.prototype.getJestRuntime = function(dir) {
    return this._builtInModules['jest-runtime'](dir).exports;
};

/**
 * Clears module and mock cache's.
 * NOTE: Not sure why the built in modules are reset here as they're never actually
 * cached, monkey see...
 */
JestModuleLoader.prototype.resetModuleRegistry = function() {
    this._mockRegistry = {};
    this._environment.global.installedModules = {};
    // TODO: see if we can inherit the non path-dependent runtime methods or at least
    // not bother re-evaluating the runtime every time as the `currPath` isn't necessary
    // with Webpack's normalized moduleIds.
    this._builtInModules = {
        'jest-runtime': function(currPath) {
            var jestRuntime = {
                exports: {
                    addMatchers: function(matchers) {
                        var jasmine = this._environment.global.jasmine;
                        var spec = jasmine.getEnv().currentSpec;
                        spec.addMatchers(matchers);
                    }.bind(this),

                    autoMockOff: function() {
                        this._shouldAutoMock = false;
                        return jestRuntime.exports;
                    }.bind(this),

                    autoMockOn: function() {
                        this._shouldAutoMock = true;
                        return jestRuntime.exports;
                    }.bind(this),

                    clearAllTimers: function() {
                        this._environment.fakeTimers.clearAllTimers();
                    }.bind(this),

                    currentTestPath: function() {
                        return this._environment.testFilePath;
                    }.bind(this),

                    dontMock: function(moduleId) {
                        this._explicitShouldMock[moduleId] = false;
                        return jestRuntime.exports;
                    }.bind(this),

                    // This isn't documented...
                    getTestEnvData: function() {
                        var frozenCopy = {};
                        // Make a shallow copy only because a deep copy seems like
                        // overkill..
                        Object.keys(this._config.testEnvData).forEach(function(key) {
                            frozenCopy[key] = this._config.testEnvData[key];
                        }, this);
                        Object.freeze(frozenCopy);
                        return frozenCopy;
                    }.bind(this),

                    genMockFromModule: function(moduleId) {
                        return this._generateMock(moduleId, true);
                    }.bind(this),

                    genMockFunction: function() {
                        return moduleMocker.getMockFunction();
                    },

                    mock: function(moduleId) {
                        this._explicitShouldMock[moduleId] = true;
                        return jestRuntime.exports;
                    }.bind(this),

                    resetModuleRegistry: function() {
                        var globalMock;
                        for (var key in this._environment.global) {
                            globalMock = this._environment.global[key];
                            if ((typeof globalMock === 'object' && globalMock !== null)
                                || typeof globalMock === 'function') {
                                globalMock._isMockFunction && globalMock.mockClear();
                            }
                        }

                        if (this._environment.global.mockClearTimers) {
                            this._environment.global.mockClearTimers();
                        }

                        this.resetModuleRegistry();

                        return jestRuntime.exports;
                    }.bind(this),

                    runAllTicks: function() {
                        this._environment.fakeTimers.runAllTicks();
                    }.bind(this),

                    runAllImmediates: function() {
                        this._environment.fakeTimers.runAllImmediates();
                    }.bind(this),

                    runAllTimers: function() {
                        this._environment.fakeTimers.runAllTimers();
                    }.bind(this),

                    runOnlyPendingTimers: function() {
                        this._environment.fakeTimers.runOnlyPendingTimers();
                    }.bind(this),

                    setMock: function(moduleId, moduleExports) {
                        this._explicitShouldMock[moduleId] = true;
                        this._explicitlySetMocks[moduleId] = moduleExports;
                        return jestRuntime.exports;
                    }.bind(this),

                    useFakeTimers: function() {
                        this._environment.fakeTimers.useFakeTimers();
                    }.bind(this),

                    useRealTimers: function() {
                        this._environment.fakeTimers.useRealTimers();
                    }.bind(this),

                    /**
                     * This is the 'patched' require passed around in the compiled
                     * Webpack build as `__webpack_require__`.
                     * @param  {Number} moduleId The Webpack moduleId.
                     * @return {*}               The module or mock.
                     */
                    _webpackRequire: function(moduleId) {
                        return this._webpackRequireModuleOrMock(moduleId);
                    }.bind(this),

                    /**
                     * Registers a manual mock (used by the `ManualMockLoader`).
                     * @param  {Number} moduleId     The Webpack moduleId.
                     * @param  {Number} mockModuleId The Webpack mock moduleId.
                     */
                    _registerManualMock: function(moduleId, mockModuleId) {
                        this._manualMockMap[moduleId] = mockModuleId;
                    }.bind(this)
                }
            };

            jestRuntime.exports._webpackRequire.requireActual = function(moduleId) {
                var module;
                this._requiringActual = true;
                module = this._webpackRequireModule(moduleId);
                this._requiringActual = false;
                return module;
            }.bind(this)

            // This is a pretty common API to use in many tests, so this is just a
            // shorter alias to make it less annoying to type out each time.
            jestRuntime.exports.genMockFn = jestRuntime.exports.genMockFunction;

            return jestRuntime;
        }.bind(this)
    };
};

/**
 * Requires either the module or mock.
 * @param  {Number} moduleId The Webpack moduleId.
 * @return {*}               The module or mock.
 */
JestModuleLoader.prototype._webpackRequireModuleOrMock = function(moduleId) {
    if (this._shouldMock(moduleId)) {
        return this._webpackRequireMock(moduleId);
    } else {
        return this._webpackRequireModule(moduleId);
    }
};

/**
 * Requires the Webpack module.
 * @param  {Number} moduleId The Webpack moduleId.
 * @return {*}               The module.
 */
JestModuleLoader.prototype._webpackRequireModule = function(moduleId) {
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
JestModuleLoader.prototype._webpackRequireMock = function(moduleId) {

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
 * Generates a mock from the given module.
 * @override
 * @param  {Number}  moduleId         The Webpack moduleId.
 * @param  {Boolean} ignoreManualMock If true manual mocks won't be returned.
 * @return {*}                        The mock.
 */
JestModuleLoader.prototype._generateMock = function(moduleId, ignoreManualMock) {

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

    // Check whether a manual mock was registered as a result of running the module
    // via `jest._registerManualMock` / the `ManualMockLoader`.
    if (!ignoreManualMock && this._manualMockMap.hasOwnProperty(moduleId)) {
        return this._webpackRequireModule(this._manualMockMap[moduleId]);
    }

    return moduleMocker.generateFromMetadata(this._mockMetaDataCache[moduleId]);
};

/**
 * Determines whether a particular module should be mocked or not.
 * @param  {Number}  moduleId The Webpack moduleId.
 * @return {Boolean}
 */
JestModuleLoader.prototype._shouldMock = function(moduleId) {

    // Never mock the entry module as that's the test.
    if (moduleId === 0 || this._requiringActual) {
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
JestModuleLoader.prototype._doesMatchUnmockListRegExps = function(moduleId) {

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
JestModuleLoader.prototype._getModulePathFromModuleId = function(moduleId) {
    var moduleStats = _.findWhere(webpackStats.modules, {
        id: moduleId
    });
    if (!moduleStats) {
        throw new Error('ModuleId ' + moduleId + ' not found in Webpack stats json.');
    }
    return moduleStats.identifier;
};

module.exports = JestModuleLoader;
