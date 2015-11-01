# Jestpack
Unfortunately [Jest](https://facebook.github.io/jest/) doesn't play nicely with apps built using [Webpack](https://webpack.github.io/), especially those using some of Webpack's more useful but non-standard features such as [loaders](http://webpack.github.io/docs/loaders.html) and [code splitting](http://webpack.github.io/docs/code-splitting.html).

One solution is to [compile tests with Webpack](https://github.com/ColCh/jest-webpack) using [Jest's script pre-processor option](https://facebook.github.io/jest/docs/api.html#config-scriptpreprocessor-string) however Webpack compiles commonJS modules into an internal module system ready for the browser which Jest doesn't understand so dependencies cannot be mocked.

Another solution is to [strip the non-standard Webpack features using the script pre-processor](https://github.com/atecarlos/webpack-babel-jest) however, depending which features you're using, it's often not possible or means you're left unable to test integral code.

Jestpack therefore attempts to solve the problem by ~~extending~~ replacing Jest's default module loader to support Webpack's internal module system.

## Installation
`npm install jestpack --save-dev`

> NOTE: Jestpack declares both `jest-cli` and `webpack` as peer dependencies meaning you must declare them both as either `devDependencies` or `dependencies` in your projects `package.json`.

## Setup
The first thing you'll want to do is tell Jest to use the Jestpack module loader and where to look for your soon-to-be bundled tests:

```js
// package.json
{
    ...
    "jest": {
        "moduleLoader": "<rootDir>/node_modules/jestpack/ModuleLoader",
        "testPathDirs": ["<rootDir>/__bundled_tests__"]
    }
}
```

Next you'll want to setup your Webpack test config to output the bundled tests in the same `testPathDirs` directory:

```js
// webpack.config.js
module.exports = {
    output: {
        path: '__bundled_tests__',
        filename: '[name].js'
    }
}
```

Then you'll need to setup your Webpack config to build each test as a separate entry point:

```js
// webpack.config.js
module.exports = {
    ...
    entry: {
        'src/__tests__/test1': './src/__tests__/test1',
        'src/__tests__/test2': './src/__tests__/test2',
        'src/__tests__/test3': './src/__tests__/test3'
        // etc.
    }
}
```
> NOTE: Using a separate entry point per test suite allows Jest to run your tests in parallel processes!

> NOTE: The /example demonstrates how the entry points could be dynamically generated.

This next step is optional depending whether you intend to define manual `__mocks__`. If you do then you need to run your modules through the manual mock loader:

```js
// webpack.config.js
module.exports = {
    ...
    preLoaders: [
        {
            test: /\.js$/,
            loader: 'jestpack/ManualMockLoader'
        }
    ]
}
```

Next up you need to apply the Jestpack plugin which transforms Jest's CommonJs API calls into something Webpack can understand, i.e. `jest.dontMock('../foo')` becomes `jest.dontMock(1)`:

```js
// webpack.config.js
var JestpackPlugin = require('jestpack/Plugin');

module.exports = {
    ...
    plugins: [
        new JestpackPlugin()
    ]
}
```

Lastly you need to write the Webpack `stats.json` to a file in the root of your `jest.config.testPathDirs` directory. So in this case `__bundled_tests__/stats.json`:

```js
// webpack.config.js
var StatsWebpackPlugin = require('stats-webpack-plugin');

module.exports = {
    ...
    plugins: [
        ...
        new StatsWebpackPlugin('stats.json')
    ]
}
```

> NOTE: A complete working configuration can be found in the /example directory.

### Optimization
Depending on the number of modules in your dependency graph you may experience *incredibly* slow builds when building a separate entry point per test suite. This can be greatly optimized using Webpack's [`CommonsChunkPlugin`](http://webpack.github.io/docs/list-of-plugins.html#commonschunkplugin):

```js
// webpack.config.js
var webpack = require('webpack');

modle.exports = {
    ...
    plugins: [
        ...
        // This is telling Webpack to extract all dependencies that are used by 2 or more modules into '__bundled_tests__/common.js'
        new webpack.optimize.CommonsChunkPlugin({
            filename: 'common.js',
            minChunks: 2
        })
    ]
}

```

Which can then be included via [`jest.config.setupEnvScriptFile`](https://facebook.github.io/jest/docs/api.html#config-setupenvscriptfile-string):

```js
// package.json
{
    ...
    "jest": {
        ...
        "setupEnvScriptFile": "<rootDir>/__bundled_tests__/common.js"
    }
}
```

In addition, if you actually need to do some environment setup you can get Webpack to execute any entry point via the `CommonsChunkPlugin`:

```js
// webpack.config.js
module.exports = {
    ...
    entry: {
        ...
        setup: './setup.js'
    },
    ...
    plugins: [
        ...
        // When the common.js chunk is included it will execute the 'setup' entry point.
        new webpack.optimize.CommonsChunkPlugin({
            name: 'setup',
            filename: 'common.js',
            minChunks: 2
        })
    ]
}
```

If you need to do some setup after Jasmine has loaded, e.g. define some global matchers, then you can use [`config.setupTestFrameworkScriptFile`](https://facebook.github.io/jest/docs/api.html#config-setuptestframeworkscriptfile-string) instead:

```js
// package.json
{
    ...
    "jest": {
        ...
        "setupTestFrameworkScriptFile": "<rootDir>/__bundled_tests__/common.js"
    }
}
```

### Tips

If you're using the ['babel-loader'](https://github.com/babel/babel-loader) it's best not to include the runtime. If for some reason you need to then make sure it's in Jest's [`config.unmockedModulePathPatterns`](https://facebook.github.io/jest/docs/api.html#config-unmockedmodulepathpatterns-array-string):

```js
// package.json
{
    ...
    "jest": {
        ...
        "unmockedModulePathPatterns": [
            ...
            "<rootDir>/node_modules/babel-runtime"
        ]
    }
}
```

If you're using [code splitting](http://webpack.github.io/docs/code-splitting.html) then you're better off disabling it for tests with the [`webpack.optimize.LimitChunkCountPlugin`](https://github.com/webpack/docs/wiki/list-of-plugins#limitchunkcountplugin):

```js
// webpack.config.js
var webpack = require('webpack');

module.exports = {
    ...
    plugins: [
        ...
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1
        })
    ]
}
```

If you're using [css modules](https://github.com/webpack/css-loader#css-modules) you'll need to add the loader to Jest's [`config.unmockedModulePathPatterns`](https://facebook.github.io/jest/docs/api.html#config-unmockedmodulepathpatterns-array-string):

```js
// package.json
{
    ...
    "jest": {
        ...
        "unmockedModulePathPatterns": [
            ...
            "<rootDir>/node_modules/css-loader"
        ]
    }
}
```

## Current Limitations

- Code coverage isn't supported.