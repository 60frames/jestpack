'use strict';

const glob = require('glob');
const webpack = require('webpack');
const StatsWebpackPlugin = require('stats-webpack-plugin');
const JestWebpackPlugin = require('jestpack/Plugin');

/**
 * Given a glob pattern returns the matched paths as an entry point object for Webpack.
 * @param  {String} globPattern A glob pattern to match tests.
 * @return {Object}             Key value pairs, keyed on filepath.
 */
function getEntryPoints(globPattern) {
    var testFiles = glob.sync(globPattern);
    var entryPoints = {};
    testFiles.forEach(function(file) {
        entryPoints[file.replace(/\.js$/, '')] = './' + file;
    });
    return entryPoints;
}

let entryPoints = getEntryPoints('src/**/__tests__/*');
entryPoints.setup = './setup';

module.exports = {
    debug: true,
    target: 'web',
    entry: entryPoints,
    output: {
        path: '__bundled_tests__',
        filename: '[name].js'
    },
    module: {
        preLoaders: [
            {
                test: /\.js$/,
                loader: 'jestpack/ManualMockLoader'
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
        new webpack.optimize.CommonsChunkPlugin({
            name: 'setup',
            filename: 'common.js',
            minChunks: 2
        }),
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1
        })
    ]
};
