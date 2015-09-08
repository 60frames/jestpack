'use strict';

jest.dontMock('./bar');

const React = require('react/addons');
const Bar = require('./bar');
const TestUtils = React.addons.TestUtils;

describe('foo/foo', () => {

    let component;

    beforeEach(() => {
        component = TestUtils.renderIntoDocument(<Bar />);
    });

    it('has a description', () => {
        let title = TestUtils.findRenderedDOMComponentWithClass(component, 'description');
        expect(title.getDOMNode().tagName).toBe('P');
        expect(title.getDOMNode().textContent).toBe('World');
    });

});