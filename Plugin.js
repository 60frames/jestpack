'use strict';

/**
 * Resolves Jest API module path arguments.
 * e.g. jest.dontMock('./foo') => jest.mock(1);
 * @constructor
 */
function JestWebpackPlugin() {}

/**
 * List of jest API methods accepting `moduleName` as an argument.
 * @type {Array}
 */
JestWebpackPlugin.prototype.jestApis = [
    'jest.dontMock',
    'jest.mock',
    'jest.genMockFromModule',
    'jest.setMock'
];

/**
 * Resolves arguments passed to Jest APIs.
 * Processes Jest api calls.
 * @return {Undefined} undefined.
 */
JestWebpackPlugin.prototype.apply = function(compiler) {
    this.jestApis.forEach(function(api) {
        compiler.parser.plugin('call ' + api, function(expr) {
            if (!expr.arguments.length) {
                return;
            }
            this.applyPluginsBailResult('call require:commonjs:item', expr,
                this.evaluateExpression(expr.arguments[0]));
        });
    });
};

module.exports = JestWebpackPlugin;
