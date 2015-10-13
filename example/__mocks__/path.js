'use strict';

var pathMock = jest.genMockFromModule('path');

pathMock.join.mockReturnValue('manually mocked path');

module.exports = pathMock;
