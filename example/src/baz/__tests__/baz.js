'use strict';

jest.dontMock('../baz');

const baz = require('../baz');

describe('baz/baz', () => {

    it('does not use it\'s manual mock', () => {
        expect(baz.doSomething()).toBe('actual module');
    });

});
