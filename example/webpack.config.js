'use strict';

var path = require('path');
var glob = require('glob');
var webpack = require('webpack');
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
    entry: getEntryPoints('src/**/__tests__/*'),
    output: {
        path: '__bundled_tests__',
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
                loader: 'babel'
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
        new StatsWebpackPlugin('stats.json'),
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1
        })
    ]
};
