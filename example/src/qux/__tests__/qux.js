'use strict';

jest.dontMock('../qux');

const qux = require('../qux');

describe('qux/qux', () => {

    it('uses code splitting', () => {
        qux.split.getSomething.mockReturnValue('mocked');
        expect(qux.split.getSomething()).toBe('mocked');
    });

});
