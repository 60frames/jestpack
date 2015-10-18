# Jestpack

Unfortunately [Jest](https://facebook.github.io/jest/) doesn't play nicely with apps built using [Webpack](https://webpack.github.io/), especially those using some of Webpack's more useful but non-standard features such as [loaders](http://webpack.github.io/docs/loaders.html) and [code splitting](http://webpack.github.io/docs/code-splitting.html).

One solution is to [compile tests with Webpack](https://github.com/ColCh/jest-webpack) using [Jest's script pre-processor option](https://facebook.github.io/jest/docs/api.html#config-scriptpreprocessor-string) however Webpack compiles commonJS modules into an internal module system ready for the browser which Jest doesn't understand so dependencies cannot be mocked.

Another solution is to [strip the non-standard Webpack features using the script pre-processor](https://github.com/atecarlos/webpack-babel-jest) however, depending which features you're using, it's often not possible or means you're left unable to test integral code.

Jestpack therefore attempts to solve the problem by ~~extending~~ replacing Jest's default module loader to support Webpack's internal module system.

## Setup
### Jest Config
```
// package.json
{
    ...
    "jest": {
        "moduleLoader": "<rootDir>/node_modules/jestpack/ModuleLoader"
    },
    "jestpack": {
        "statsPath": "__bundled_tests__/stats.json", // relative to `process.cwd()`.
        "bundledTestsPattern": "__bundled_tests__/**", // glob pattern relative to `process.cwd()`
        "bundledTestsIgnorePattern": "" // glob pattern relative to `process.cwd()`
    }
    ...
}

```

### Webpack Config
```
// webpack.config.js

var JestWebpackPlugin = require('jestpack/Plugin');
var StatsWebpackPlugin = require('stats-webpack-plugin');

modue.exports = {
    ...
    // Create a separate entry point per test to isolate them.
    entry: {
        foo: './__tests__/foo.js',
        bar: './__tests__/bar.js',
        baz: './__tests__/baz.js'
    },
    ...
    preLoaders: [
        {
            test: /\.js$/,
            loader: 'jestpack/ManualMockLoader'
        }
    ],
    ...
    plugins: [
        new JestWebpackPlugin(),
        new StatsPlugin('stats.json')
    ]
    ...
}
```

## Tips

- If using ['babel-loader'](https://github.com/babel/babel-loader) it's best not to include the runtime. If for some reason you need to then make sure 'babel-runtime' (<rootDir>/node_modules/babel-runtime) is in your [`jest.config.unmockedModulePathPatterns`](https://facebook.github.io/jest/docs/api.html#config-unmockedmodulepathpatterns-array-string).

- If using [code splitting](http://webpack.github.io/docs/code-splitting.html) it's best to limit the max chunks to 1 using the [`webpack.optimize.LimitChunkCountPlugin`](https://github.com/webpack/docs/wiki/list-of-plugins#limitchunkcountplugin) when testing.

- If using [css modules](https://github.com/webpack/css-loader#css-modules) with the css loader then it's best to add the 'css-loader' to your [`jest.config.unmockedModulePathPatterns`](https://facebook.github.io/jest/docs/api.html#config-unmockedmodulepathpatterns-array-string). In addition it's best not to hash the classNames so they can be consistently asserted.

## Current Limitations

- `config.setupEnvScriptFile` and `config.setupTestFrameworkScriptFile` aren't supported.
- Code coverage isn't supported.
