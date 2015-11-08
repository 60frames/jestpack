'use strict';

const ConstDependency = require('webpack/lib/dependencies/ConstDependency');

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
 * Adds support for Jest API.
 * e.g. jest.dontMock('./foo') => jest.dontMock(1);
 * @constructor
 */
class JestpackPlugin {

    /**
     * Resolves Jest API `moduleName` arguments and updates the Webpack runtime.
     * @param  {Object} compiler The Webpack compiler.
     */
    apply(compiler) {

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

        compiler.plugin('compilation', compilation => {

            // Replace `__webpack_require__` with `require` as defined by Jest's JSDom env.
            compilation.mainTemplate.plugin('module-require', () => {
                return 'jest._webpackRequire';
            });

            // Make all references to the module cache global so 'jestpack/ModuleLoader'
            // can manage the object *and the reference*.
            compilation.mainTemplate.plugin('local-vars', source => {
                return source.replace('var installedModules', 'window.installedModules');
            });

            // Provide `__webpack_require__` to 'jestpack/ModuleLoader'.
            compilation.mainTemplate.plugin('startup', source => {
                return [
                    '',
                    'jest._setupWebpackRequire(__webpack_require__);',
                    source
                ].join('\n');
            });
        });
    }
}

module.exports = JestpackPlugin;
