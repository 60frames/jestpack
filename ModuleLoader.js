'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const moduleMocker = require('jest-cli/src/lib/moduleMocker');
const utils = require('jest-cli/src/lib/utils');

let _configUnmockListRegExpCache = null;
let webpackStats;

/**
 * Builds simple resource map containing only the bundled test files.
 * @param  {Object}  config The Jest config.
 * @return {Promise}        The 'node-haste'(ish) resource map.
 */
function loadSimpleResourceMap(config) {
    return new Promise((resolve, reject) => {

        // Convert Jest config into glob pattern.
        let testPathDirs;
        let testFileExtensions;
        let generatedGlob;

        if (config.testPathDirs.length === 1) {
            testPathDirs = config.testPathDirs[0];
        } else {
            testPathDirs = '{' + config.testPathDirs.join(',') + '}';
        }

        if (config.testFileExtensions.length === 1) {
            testFileExtensions = config.testFileExtensions[0];
        } else {
            testFileExtensions = '{' + config.testFileExtensions.join(',') + '}';
        }

        generatedGlob = testPathDirs + '/' +
            '**/' + config.testDirectoryName + '/**/*.' + testFileExtensions;

        glob(generatedGlob, (err, files) => {
            if (err) {
                reject(err);
            } else {
                let resourceMap;
                resourceMap = {
                    resourcePathMap: {}
                };
                files.forEach(file => {
                    let fullPath = path.resolve(file);
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
 * Checks the root of each `config.testPathDirs` directory for the Webpack `stats.json`.
 * @param  {Object} config The Jest config.
 * @return {Object}        The Webpack stats json.
 */
function getWebpackStats(config) {

    let statsPaths = config.testPathDirs.map(testPathDir => {
        return path.join(testPathDir, 'stats.json');
    });

    statsPaths.some(statsPath => {
        try {
            webpackStats = require(statsPath);
        } catch (oh) {
            // not found
        }
        return !!webpackStats;
    });

    if (!webpackStats) {
        throw new Error('Cannot find Webpack stats in: \n' + statsPaths.join('\n'));
    }

    return webpackStats;
}

/**
 * Adds support for Webpack's internal `__webpack_require__` module loader. Designed
 * to replace the default `HasteModuleLoader` used by Jest.
 * @class JestModuleLoader
 */
class JestModuleLoader {

    constructor(config, environment, resourceMap) {
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
        this._jestRuntime = null;

        // Shared across instances
        if (!webpackStats) {
            webpackStats = getWebpackStats(config);
        }

        if (_configUnmockListRegExpCache === null) {
            _configUnmockListRegExpCache = new WeakMap();
        }

        if (!config.unmockedModulePathPatterns ||
            config.unmockedModulePathPatterns.length === 0) {
            this._unmockListRegExps = [];
        } else {
            this._unmockListRegExps = _configUnmockListRegExpCache.get(config);
            if (!this._unmockListRegExps) {
                this._unmockListRegExps = config.unmockedModulePathPatterns
                    .map(unmockPathRe => {
                        return new RegExp(unmockPathRe);
                    });
                _configUnmockListRegExpCache.set(config, this._unmockListRegExps);
            }
        }

        this.resetModuleRegistry();
    }

    static loadResourceMap() {
        return loadSimpleResourceMap(...arguments);
    }

    // NOTE: Currently doesn't implement cache file, not sure if 'glob' supports this or if
    // a fs.stats obj will need to be manually stored.
    static loadResourceMapFromCacheFile() {
        return loadSimpleResourceMap(...arguments);
    }

    constructBoundRequire() {
        return () => {
            throw new Error('`JestModuleLoader` does not implement `require` for modules outside of Webpack.');
        };
    }

    /**
     * Coverage would likely make more sense as a Webpack loader.
     * https://github.com/deepsweet/istanbul-instrumenter-loader?
     * Although I wonder what implications there are when we run tests with a bundle
     * per test file (i.e. lot's of duplicated code).
     */
    getAllCoverageInfo() {
        throw new Error('\'JestModuleLoader\' does not implement coverage.');
    }

    getCoverageForFilePath() {
        throw new Error('\'JestModuleLoader\' does not implement coverage.');
    }

    getDependenciesFromPath() {
        throw new Error('\'JestModuleLoader\' does not implement coverage.');
    }

    // TODO: Investigate this method further (it's called from TestRunner).
    getDependentsFromPath() {
        return [];
    }

    // Pretty certain this doesn't need to be public, it's only exposed on `require.requireMock`
    // which `JestModuleLoader` will handle via `jest._webpackRequire.requireMock`.
    requireMock() {
        throw new Error('\'JestModuleLoader\' does not implement `requireMock` for modules outside of Webpack.');
    }

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
    requireModule(currPath, moduleName) {

        let moduleObj;

        // TODO: remove this as latest jest doesn't ever require('jest-runtime'),
        // it just calls moduleLoader.getJestRuntim();.
        if (moduleName === 'jest-runtime') {
            moduleObj = {
                exports: this.getJestRuntime()
            };
        } else {
            moduleObj = {
                __filename: currPath,
                exports: {}
            };
            this._execModule(moduleObj);
        }

        return moduleObj.exports;
    }

    /**
     * Given the `moduleObj` holding the module path the file is evaluated in the
     * bound JSDom env.
     * @param  {Object}    moduleObj The module obj.
     */
    _execModule(moduleObj) {

        let modulePath = moduleObj.__filename;
        let moduleLocalBindings = {
            // `module`, `exports`, `require`, `__dirname` and `__filename` aren't
            // necessary here as we're only executing a Webpack bundle.
            global: this._environment.global,
            jest: this.getJestRuntime()
        };

        utils.runContentWithLocalBindings(
            this._environment,
            fs.readFileSync(modulePath, 'utf8'),
            modulePath,
            moduleLocalBindings
        );
    }

    // This is bound to the require in HasteModuleLoader, `JestModuleLoader` handles
    // this with `jest._webpackRequire`.
    requireModuleOrMock() {
        throw new Error('\'JestModuleLoader\' does not implement `requireModuleOrMock` for modules outside of Webpack.');
    }

    /**
     * Returns the Jest runtime.
     * @param  {String} dir Has no use in `JestModuleLoader`.
     * @return {Object}     The Jest runtime.
     */
    getJestRuntime() {
        if (!this._jestRuntime) {
            this._jestRuntime = this._createRuntime();
        }
        return this._jestRuntime;
    }

    // TODO: see if we can inherit the non path-dependent runtime methods.
    _createRuntime() {
        const runtime = {

            addMatchers: matchers => {
                const jasmine = this._environment.global.jasmine;
                const spec = jasmine.getEnv().currentSpec;
                spec.addMatchers(matchers);
            },

            autoMockOff: () => {
                this._shouldAutoMock = false;
                return runtime;
            },

            autoMockOn: () => {
                this._shouldAutoMock = true;
                return runtime;
            },

            clearAllTimers: () => this._environment.fakeTimers.clearAllTimers(),

            currentTestPath: () => this._environment.testFilePath,

            dontMock: (moduleId) => {
                this._explicitShouldMock[moduleId] = false;
                return runtime;
            },

            // This isn't documented...
            getTestEnvData: () => {
                const frozenCopy = {};
                // Make a shallow copy only because a deep copy seems like
                // overkill..
                Object.keys(this._config.testEnvData).forEach(key => {
                    frozenCopy[key] = this._config.testEnvData[key];
                }, this);
                Object.freeze(frozenCopy);
                return frozenCopy;
            },

            genMockFromModule: moduleId => this._generateMock(moduleId, true),

            genMockFunction: moduleMocker.getMockFunction,

            genMockFn: moduleMocker.getMockFunction,

            mock: moduleId => {
                this._explicitShouldMock[moduleId] = true;
                return runtime;
            },

            /* eslint-disable */
            resetModuleRegistry: () => {
                const envGlobal = this._environment.global;
                Object.keys(envGlobal).forEach(key => {
                    const globalMock = envGlobal[key];
                    if ((typeof globalMock === 'object' && globalMock !== null) ||
                        typeof globalMock === 'function') {
                        globalMock._isMockFunction && globalMock.mockClear();
                    }
                });

                if (envGlobal.mockClearTimers) {
                    envGlobal.mockClearTimers();
                }

                this.resetModuleRegistry();

                return runtime;
            },
            /* eslint-enable */

            runAllTicks: () => this._environment.fakeTimers.runAllTicks(),

            runAllImmediates: () => this._environment.fakeTimers.runAllImmediates(),

            runAllTimers: () => this._environment.fakeTimers.runAllTimers(),

            runOnlyPendingTimers: () => this._environment.fakeTimers.runOnlyPendingTimers(),

            setMock: (moduleId, moduleExports) => {
                this._explicitShouldMock[moduleId] = true;
                this._explicitlySetMocks[moduleId] = moduleExports;
                return runtime;
            },

            useFakeTimers: () => this._environment.fakeTimers.useFakeTimers(),

            useRealTimers: () => this._environment.fakeTimers.useRealTimers(),

            /* eslint-disable camelcase */
            _setupWebpackRequire: __webpack_require__ => this._setupWebpackRequire(
                runtime,
                __webpack_require__
            ),
            /* eslint-enable */

            /**
             * This is the 'patched' require passed around in the compiled
             * Webpack build as `__webpack_require__`.
             * @param  {Number} moduleId The Webpack moduleId.
             * @return {*}               The module or mock.
             */
            _webpackRequire: moduleId => this._webpackRequireModuleOrMock(moduleId),

            /**
             * Registers a manual mock (used by the `ManualMockLoader`).
             * @param  {Number} moduleId     The Webpack moduleId.
             * @param  {Number} mockModuleId The Webpack mock moduleId.
             */
            _registerManualMock: (moduleId, mockModuleId) => this._manualMockMap[moduleId] = mockModuleId
        };

        runtime._webpackRequire.requireActual = moduleId => {
            let module;
            this._requiringActual = true;
            module = this._webpackRequireModule(moduleId);
            this._requiringActual = false;
            return module;
        };

        return runtime;
    }

    resetModuleRegistry() {
        this._mockRegistry = {};
        this._environment.global.installedModules = {};
    }

    /* eslint-disable camelcase */
    /**
     * Stores reference to the real `__webpack_require__` and copies static methods
     * to the wrapping `jest._webpackRequire`.
     * @param  {Object}   runtime             The Jest runtime.
     * @param  {Function} __webpack_require__ The real Webpack require.
     */
    _setupWebpackRequire(runtime, __webpack_require__) {
        let prop;
        this.__webpack_require__ = __webpack_require__;
        for (prop in __webpack_require__) {
            if (__webpack_require__.hasOwnProperty(prop)) {
                runtime._webpackRequire[prop] = __webpack_require__[prop];
            }
        }
    }
    /* eslint-enable */

    /**
     * Requires either the module or mock.
     * @param  {Number} moduleId The Webpack moduleId.
     * @return {*}               The module or mock.
     */
    _webpackRequireModuleOrMock(moduleId) {
        if (this._shouldMock(moduleId)) {
            return this._webpackRequireMock(moduleId);
        }
        return this._webpackRequireModule(moduleId);
    }

    /**
     * Requires the Webpack module.
     * @param  {Number} moduleId The Webpack moduleId.
     * @return {*}               The module.
     */
    _webpackRequireModule() {
        let webpackRequire = this.__webpack_require__;

        if (!webpackRequire) {
            throw new Error('`__webpack_require__` has not been defined.');
        }

        return webpackRequire.apply(void 0, arguments);
    }

    /**
     * Requires a mocked version of the module.
     * @param  {Number} moduleId The Webpack moduleId.
     * @return {*}               The mock.
     */
    _webpackRequireMock(moduleId) {

        if (this._explicitlySetMocks.hasOwnProperty(moduleId)) {
            return this._explicitlySetMocks[moduleId];
        }

        if (this._mockRegistry.hasOwnProperty(moduleId)) {
            return this._mockRegistry[moduleId];
        }

        this._mockRegistry[moduleId] = this._generateMock(moduleId);
        return this._mockRegistry[moduleId];
    }

    /**
     * Generates a mock from the given module.
     * @override
     * @param  {Number}  moduleId         The Webpack moduleId.
     * @param  {Boolean} ignoreManualMock If true manual mocks won't be returned.
     * @return {*}                        The mock.
     */
    _generateMock(moduleId, ignoreManualMock) {

        let module;

        if (!this._mockMetaDataCache.hasOwnProperty(moduleId)) {
            let origMockRegistry;
            let origModuleRegistry;

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
    }

    /**
     * Determines whether a particular module should be mocked or not.
     * @param  {Number}  moduleId The Webpack moduleId.
     * @return {Boolean}
     */
    _shouldMock(moduleId) {

        // Never mock the entry module as that's the test.
        if (moduleId === 0 || this._requiringActual) {
            return false;
        }

        if (this._explicitShouldMock.hasOwnProperty(moduleId)) {
            return this._explicitShouldMock[moduleId];
        }

        if (this._shouldAutoMock) {
            if (!this._configShouldMockModuleNames.hasOwnProperty(moduleId) &&
                this._unmockListRegExps.length > 0) {
                this._configShouldMockModuleNames[moduleId] = !this._doesMatchUnmockListRegExps(moduleId);
            }
            return !!this._configShouldMockModuleNames[moduleId];
        }

        return false;
    }

    /**
     * Checks the module path against the paths defined in `config.unmockedModulePathPatterns`.
     * @param  {Number}  moduleId The Webpack moduleId.
     * @return {Boolean}
     */
    _doesMatchUnmockListRegExps(moduleId) {

        const modulePath = this._getModulePathFromModuleId(moduleId);

        let unmockRegExp;
        let i;

        for (i = 0; i < this._unmockListRegExps.length; i++) {
            unmockRegExp = this._unmockListRegExps[i];
            if (unmockRegExp.test(modulePath)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Given the Webpack `moduleId` returns the module path.
     * @param  {Number} moduleId The Webpack moduleId.
     * @return {String}          The module path. NOTE: This may contain the Webpack
     *                           loader path.
     */
    _getModulePathFromModuleId(moduleId) {
        const moduleStats = (webpackStats.modules || []).find(module => module.id === moduleId);
        if (!moduleStats) {
            throw new Error('ModuleId ' + moduleId + ' not found in Webpack stats json.');
        }
        return moduleStats.identifier;
    }

}

module.exports = JestModuleLoader;
