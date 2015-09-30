'use strict';

var querystring = require.requireActual('querystring');

var bazMock = {
    doSomething: jest.genMockFunction()
};

bazMock.doSomething.mockReturnValue(querystring.stringify({
    manually: 'mocked'
}));

module.export = bazMock;
