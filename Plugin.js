'use strict';

var ConstDependency = require('webpack/lib/dependencies/ConstDependency');

/**
 * Adds support for Jest API.
 * e.g. jest.dontMock('./foo') => jest.dontMock(1);
 * @constructor
 */
function JestpackPlugin() {}

/**
 * Resolves module paths.
 * @param  {Object} expr     The expression.
 * @param  {Number} argIndex Which argument to resolve, defaults to the first arg.
 */
function resolveArgument(expr, argIndex) {
    if (typeof argIndex === 'undefined') {
        argIndex = 0;
    }
    if (!expr.arguments.length || !expr.arguments[argIndex]) {
        return;
    }
    this.applyPluginsBailResult('call require:commonjs:item', expr,
            this.evaluateExpression(expr.arguments[argIndex]));
}

/**
 * Resolves Jest API `moduleName` arguments and updates the Webpack runtime.
 * @return {Undefined} undefined.
 */
JestpackPlugin.prototype.apply = function(compiler) {

    compiler.parser.plugin('call jest.dontMock', resolveArgument);
    compiler.parser.plugin('call jest.mock', resolveArgument);
    compiler.parser.plugin('call jest.genMockFromModule', resolveArgument);
    compiler.parser.plugin('call jest.setMock', resolveArgument);
    compiler.parser.plugin('call jest._registerManualMock', function(expr) {
        resolveArgument.call(this, expr);
        resolveArgument.call(this, expr, 1);
    });
    compiler.parser.plugin('call require.requireActual', resolveArgument);
    compiler.parser.plugin('expression require.requireActual', function(expr) {
        var dep = new ConstDependency('__webpack_require__.requireActual', expr.range);
        dep.loc = expr.loc;
        this.state.current.addDependency(dep);
        return true;
    });

    compiler.plugin('compilation', function(compilation) {

        // Replace `__webpack_require__` with `require` as defined by Jest's JSDom env.
        compilation.mainTemplate.plugin('module-require', function() {
            return 'jest._webpackRequire';
        });

        // Make all references to the module cache global so 'jestpack/ModuleLoader'
        // can manage the object *and the reference*.
        compilation.mainTemplate.plugin('local-vars', function(source) {
            return source.replace('var installedModules', 'window.installedModules');
        });

        // Expose `__webpack_require__` for 'jestpack/ModuleLoader'.
        compilation.mainTemplate.plugin('startup', function(source) {
            return [
                '',
                '// Expose `__webpack_require__` for \'jestpack/ModuleLoader\'',
                'window.__webpack_require__ = __webpack_require__;',
                source
            ].join('\n');
        });

    });

};

module.exports = JestpackPlugin;
