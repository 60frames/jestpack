# Jestpack [![Build Status](https://travis-ci.org/60frames/jestpack.svg?branch=master)](https://travis-ci.org/60frames/jestpack) [![npm version](https://badge.fury.io/js/jestpack.svg)](https://badge.fury.io/js/jestpack)

Unfortunately [Jest doesn't play nicely with Webpack](http://stackoverflow.com/questions/31547587/testing-webpack-built-react-components-with-jest), especially when using some of Webpack's more useful features such as [loaders](http://webpack.github.io/docs/loaders.html) or [code splitting](http://webpack.github.io/docs/code-splitting.html).

Jestpack attempts to solve this problem by ~~extending~~ replacing Jest's default module loader to support Webpack's internal module system.

## Installation

`npm install jestpack --save-dev`

> NOTE: Jestpack >=0.2.0 depends on Node >=5.x.x.

> NOTE: Jestpack declares both `jest-cli` and `webpack` as peer dependencies meaning you must declare them both as either `devDependencies` or `dependencies` in your projects `package.json`.

> NOTE: Jestpack doesn't currently support Jest 0.8.x https://github.com/60frames/jestpack/issues/12

## Setup
Jestpack works by supplying pre-built test files to Jest so the first thing you'll want to do is tell Jest where it can expect to find your soon-to-be-bundled test files:

```js
// package.json
{
    ...
    "jest": {
        "testPathDirs": ["<rootDir>/__bundled_tests__"]
    }
}
```

Then you'll need to get Jest to use the Jestpack module loader:

```js
// package.json
{
    ...
    "jest": {
        ...
        "moduleLoader": "<rootDir>/node_modules/jestpack/ModuleLoader",
    }
}
```

Now you're ready to setup your Webpack config by first specifiying the output directory:

```js
// webpack.config.js
module.exports = {
    output: {
        path: '__bundled_tests__',
        filename: '[name].js'
    }
}
```

And then getting Webpack to build each test as a separate entry point:

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

If you intend to define manual `__mocks__` then you need to run your modules through the manual mock loader:

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

Finally, you need to apply the Jestpack plugin which transforms Jest's CommonJs API calls into something Webpack can understand, i.e. `jest.dontMock('../foo')` becomes `jest.dontMock(1)`:

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

And save the `stats.json` in the root of your `config.testPathDirs` directory. So in this case `__bundled_tests__/stats.json`:

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

Tests can then be run by building your tests and running Jest:

`webpack && jest`

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

Which can then be included via Jest's [`config.setupEnvScriptFile`](https://facebook.github.io/jest/docs/api.html#config-setupenvscriptfile-string):

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

In addition, if you actually need to do some environment setup you can get the common chunk to execute an entry point like this:

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

If you need to do some setup after Jasmine has loaded, e.g. define some global matchers, then you can use Jest's [`config.setupTestFrameworkScriptFile`](https://facebook.github.io/jest/docs/api.html#config-setuptestframeworkscriptfile-string) instead:

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

If you're using the [babel-loader](https://github.com/babel/babel-loader) it's best not to include the runtime. If for some reason you need to then make sure it's in Jest's [`config.unmockedModulePathPatterns`](https://facebook.github.io/jest/docs/api.html#config-unmockedmodulepathpatterns-array-string):

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

If you're using [code splitting](http://webpack.github.io/docs/code-splitting.html) then you're better off disabling it for tests with Webpack's [`LimitChunkCountPlugin`](https://github.com/webpack/docs/wiki/list-of-plugins#limitchunkcountplugin):

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
