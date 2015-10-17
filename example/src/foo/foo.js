'use strict';

var React = require('react');
var style = require('./foo.css');
var Bar = require('../bar/bar');
var baz = require('../baz/baz');
var path = require('path');
var last = require('./localloader!lodash/array/last');

last = require('./localloader!lodash/array/last.js');

var Foo = React.createClass({

    statics: {
        doSomething: function() {
            return baz.doSomething();
        },
        joinPath: function() {
            return path.join.apply(path, arguments);
        },
        arrayLast: function(arr) {
            return last(arr);
        }
    },

    render: function() {
        return (
            <div>
                <h1 className={style.title}>Hello</h1>
                <Bar />
            </div>
        );
    }

});

module.exports = Foo;
