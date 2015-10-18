var qux = {};

require.ensure([], function() {
	qux.split = require('./split');
});

module.exports = qux;
