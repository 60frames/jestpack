'use strict';

var React = require('react');
var style = require('./foo.css');
var Bar = require('../bar/bar');
var baz = require('../baz/baz');
var path = require('path');
var last = require('./localloader!lodash/array/last');
var _ = require('underscore');

last = require('./localloader!lodash/array/last.js');

class Foo extends React.Component {

    render() {
        return (
            <div>
                <h1 className={style.title}>Hello</h1>
                <Bar />
            </div>
        );
    }

}

Foo.doSomething = function() {
    return baz.doSomething();
};

Foo.joinPath = function() {
    return path.join.apply(path, arguments);
};

Foo.arrayLast = function(arr) {
    return last(arr);
};

module.exports = Foo;
