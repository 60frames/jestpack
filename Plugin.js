'use strict';

/**
 * Resolves Jest API `moduleName` arguments.
 * e.g. jest.dontMock('./foo') => jest.dontMock(1);
 * @constructor
 */
function JestWebpackPlugin() {}

/**
 * Resolves arguments passed to Jest APIs.
 * Processes Jest api calls.
 * @return {Undefined} undefined.
 */
JestWebpackPlugin.prototype.apply = function(compiler) {

    // Resolve Jest api module paths.
    function resolveArgument(expr) {
        if (!expr.arguments.length) {
            return;
        }
        this.applyPluginsBailResult('call require:commonjs:item', expr,
                this.evaluateExpression(expr.arguments[0]));
    }
    compiler.parser.plugin('call jest.dontMock', resolveArgument);
    compiler.parser.plugin('call jest.mock', resolveArgument);
    compiler.parser.plugin('call jest.genMockFromModule', resolveArgument);
    compiler.parser.plugin('call jest.setMock', resolveArgument);

    // Modify the Webpack runtime to use Jest's require.
    compiler.plugin('compilation', function(compilation) {

        // Replace `__webpack_require__` with `require` as defined by Jest's JSDom env.
        compilation.mainTemplate.plugin('module-require', function(source) {
            return 'jest.__webpack_require__';
        });

        // Make the all references to the cache global so 'jest-webpack/ModuleLoader'
        // can manage the object and the reference.
        compilation.mainTemplate.plugin('local-vars', function(source) {
            return source.replace('var installedModules', 'window.installedModules');
        });

        // Expose `__webpack_require__` for 'jest-webpack/ModuleLoader'.
        compilation.mainTemplate.plugin('startup', function(source) {
            return [
                '',
                '// Expose `__webpack_require__` for \'jest-webpack/ModuleLoader\'',
                'window.__webpack_require__ = __webpack_require__;',
                source
            ].join('\n');
        });

    });

};

module.exports = JestWebpackPlugin;