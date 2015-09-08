# Jest Webpack

Unfortuantely Jest doesn't play nicely with apps built using Webpack, especially those using some of Webpack's more useful but non-standard features such as [loaders](http://webpack.github.io/docs/loaders.html) and [code splitting](http://webpack.github.io/docs/code-splitting.html).

One solution is to [compile tests with Webpack](https://github.com/ColCh/jest-webpack) using [Jest's ability to pre-process scripts](https://facebook.github.io/jest/docs/api.html#config-scriptpreprocessor-string) however Webpack compiles commonJS modules into an internal module system ready for the browser which Jest doesn't understand so dependecies cannot be mocked.

Another solution is to [strip the non-standard Webpack features using the script pre-processor](https://github.com/atecarlos/webpack-babel-jest) however, depending what features you're using, it's often not possible or means you're left unable to test integral code.

Jest Webpack therefore takes a different approach and attempts to solve the problem by extending Jest's default `HasteModuleLoader` to support Webpack's internal module system.

## Setup
### Jest Config
```
// package.json
{
    ...
    "jest": {
        "moduleLoader": "<rootDir>/node_modules/jest-webpack/ModuleLoader"
    }
    ...
}

```

### Webpack Config
```
// webpack.config.js

var JestWebpackPlugin = require('jest-webpack/Plugin');

modue.exports = {
    ...
    // Create a separate entry point per test to isolate tests.
    entry: {
        test1: './tests/test1.test.js',
        test2: './tests/test2.test.js',
        test3: './tests/test3.test.js'
    },
    ...
    plugins: [
        new JestWebpackPlugin(),
        new StatsPlugin() // TODO: document this properly
    ]
    ...
}
```

## TODO

- Create /example.
- Support manual `__mocks__`...this isn't really useful until manual mocks are working.
- Support `require.generateMock`, `require.requireMock` and `require.requireActual`.
- Option out `stats.json` file path.
- Improve performance; having to build Webpack on top of running Jest is slow.
    - Investigate dropping `HasteModuleLoader` altogether. In theory it should be
    possible as Webpack is handling module resolution and test isolation so the
    files that are actually being executed by `HasteModuleLoader` are just the
    pre-determined compiled test files (and maybe the `setupEnvScriptFile` and `setupTestFrameworkScriptFile`?).
- Code coverage...Not even looked at this yet, might be more easily handled by Webpack?
