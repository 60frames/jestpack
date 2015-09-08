'use strict';

var React = require('react');
var style = require('./foo.css');
var Bar = require('../bar/bar');

var Foo = React.createClass({

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
