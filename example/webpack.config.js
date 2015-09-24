'use strict';

var path = require('path');
var glob = require('glob');
var StatsWebpackPlugin = require('stats-webpack-plugin');
var JestWebpackPlugin = require('jest-webpack/Plugin');

/**
 * Given a glob pattern returns the matched paths as an entry point object for Webpack.
 * @param  {String} globPattern A glob pattern to match tests.
 * @return {Object}             Key value pairs, keyed on filepath.
 */
function getEntryPoints(globPattern) {
    var testFiles = glob.sync(globPattern);
    var entryPoints = {};
    testFiles.forEach(function(file) {
        entryPoints[file] = './' + file;
    });
    return entryPoints;
}

module.exports = {
    debug: true,
    target: 'web',
    entry: getEntryPoints('src/**/*.test.js'),
    output: {
        path: '__tests__',
        filename: '[name]'
    },
    module: {
        preLoaders: [
            {
                test: /\.js$/,
                loader: 'jest-webpack/ManualMockLoader'
            }
        ],
        loaders: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: 'babel?optional[]=runtime'
            },
            {
                test: /\.css$/,
                exclude: /node_modules/,
                loader: 'style!css?modules&localIdentName=[local]'
            }
        ]
    },
    plugins: [
        new JestWebpackPlugin(),
        new StatsWebpackPlugin('stats.json', {
            chunkModules: true
        })
    ]
};
