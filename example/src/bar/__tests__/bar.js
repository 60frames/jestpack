'use strict';

jest.dontMock('../bar');

const React = require('react/addons');
const Bar = require('../bar');
const TestUtils = React.addons.TestUtils;

describe('bar/bar', () => {

    let component;

    beforeEach(() => {
        component = TestUtils.renderIntoDocument(<Bar />);
    });

    it('has a description', () => {
        let title = TestUtils.findRenderedDOMComponentWithClass(component, 'description');
        expect(React.findDOMNode(title).tagName).toBe('P');
        expect(React.findDOMNode(title).textContent).toBe('World');
    });

    it('has access to custom matchers defined in config.setupTestFrameworkScriptFile', () => {
        expect(new String('bar')).toBeInstanceOf(String);
    });

});