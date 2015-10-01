'use strict';

var querystring = require.requireActual('querystring');
var bazMock = jest.genMockFromModule('../baz');

bazMock.doSomething.mockReturnValue(querystring.stringify({
    manually: 'mocked'
}));

module.exports = bazMock;
