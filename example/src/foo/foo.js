'use strict';

var React = require('react');
var style = require('./foo.css');
var Bar = require('../bar/bar');
var baz = require('../baz/baz');

var Foo = React.createClass({

    statics: {
        doSomething: function() {
            return baz.doSomething();
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
