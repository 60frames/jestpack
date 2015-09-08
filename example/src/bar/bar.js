'use strict';

var React = require('react');
var style = require('./bar.css');

var Bar = React.createClass({

    render: function() {
        return (
            <p className={style.description}>World</p>
        );
    }

});

module.exports = Bar;
