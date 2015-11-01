NOTE: README is WIP.

# Jestpack

Unfortunately [Jest](https://facebook.github.io/jest/) doesn't play nicely with apps built using [Webpack](https://webpack.github.io/), especially those using some of Webpack's more useful but non-standard features such as [loaders](http://webpack.github.io/docs/loaders.html) and [code splitting](http://webpack.github.io/docs/code-splitting.html).

One solution is to [compile tests with Webpack](https://github.com/ColCh/jest-webpack) using [Jest's script pre-processor option](https://facebook.github.io/jest/docs/api.html#config-scriptpreprocessor-string) however Webpack compiles commonJS modules into an internal module system ready for the browser which Jest doesn't understand so dependencies cannot be mocked.

Another solution is to [strip the non-standard Webpack features using the script pre-processor](https://github.com/atecarlos/webpack-babel-jest) however, depending which features you're using, it's often not possible or means you're left unable to test integral code.

Jestpack therefore attempts to solve the problem by ~~extending~~ replacing Jest's default module loader to support Webpack's internal module system.

## Setup

The first thing you'll need to do is tell Jest to use the Jestpack module loader and to look for tests in the `__bundled_tests__` directory:

```
// package.json
{
    ...
    "jest": {
        "moduleLoader": "<rootDir>/node_modules/jestpack/ModuleLoader",
        "testDirectoryName": "__bundled_tests__"
    }
    ...
}
```

Next you'll need to setup Webpack to build each test file as a separate entry point:

NOTE: Using a separate entry point per test suite allows Jest to run your tests in parallel processes.

```
// webpack.config.js
{
    ...
    entry: {
        test1: './__tests__/test1',
        test2: './__tests__/test2',
        test3: './__tests__/test3'
        // etc.
    }
    ...
}

```

Once your entry points have been defined you need to setup the output:

```
// webpack.config.js
{
    ...
    output: {
        path: '__bundled_tests__',
        filename: '[name].js'
    }
    ...
}
```

If you want to define manual `__mocks__` then you'll just need to let Webpack know how to bundle these using the `ManualMockLoader`:

```
// webpack.config.js
{
    ...
    preLoaders: [
        {
            test: /\.js$/,
            loader: 'jestpack/ManualMockLoader'
        }
    ]
    ...
}
```

Next you need to apply the Jestpack `Plugin` which transforms Jest's CommonJs API calls into Webpack module calls, i.e. `jest.dontMock('../foo')` becomes `jest.dontMock(1)`:

```
// webpack.config.js

var JestpackPlugin = require('jestpack/Plugin');

{
    ...
    plugins: [
        new JestpackPlugin()
    ]
    ...
}
```

Lastly you need to write out the Webpack stats.json to disk for use by the Jestpack ModuleLoader. By default Jestpack looks for stats.json in `./__bundled_tests__/stats.json`.

```
// webpack.config.js

var StatsWebpackPlugin = require('stats-webpack-plugin');

{
    plugins: [
        ...
        new StatsWebpackPlugin('stats.json')
    ]
}
```

A working example can be found here in the 'example' directory.

### Optimization
Depending on the number of modules in your dependency graph you may experience incredibly slow builds when creating a separate entry point per test suite. This can be greatly optimized using Webpack's [`CommonsChunkPlugin`](TODO):

```
// webpack.config.js

var webpack = require('webpack');

{
    plugins: [
        ...
        // This is telling Webpack to extract all dependencies that are used by 2 or more modules into './__bundled_tests__/common.js'
        new webpack.optimize.CommonsChunkPlugin('common.js', 2)
    ]
}

```

Which can then be included via Jest's [`config.setupEnvScriptFile`](https://facebook.github.io/jest/docs/api.html#config-setupenvscriptfile-string):

```
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

```
{
    ...
    entry: {
        ...
        setup: './setup.js'
    },
    ...
    plugins: [
        ...
        // When the common.js chunk is included it will execute the 'setup' entry point.
        new webpack.optimize.CommonsChunkPlugin('setup', 'common.js', 2)
    ]
}
```

If you need to do some setup after jasmine has loaded, e.g. define some global matchers, then you can use [`config.setupTestFrameworkScriptFile`](https://facebook.github.io/jest/docs/api.html#config-setuptestframeworkscriptfile-string) instead:

```
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

```
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

```
// webpack.config.js

var webpack = require('webpack');

{
    ...
    plugins: [
        ...
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1
        })
    ]
    ...
}
```

If you're using [css modules](https://github.com/webpack/css-loader#css-modules) you'll need to add the loader to Jest's [`config.unmockedModulePathPatterns`](https://facebook.github.io/jest/docs/api.html#config-unmockedmodulepathpatterns-array-string):

```
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
