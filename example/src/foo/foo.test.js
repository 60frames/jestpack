'use strict';

jest.dontMock('./foo');

const React = require('react/addons');
const Foo = require('./foo');
const Bar = require('../bar/bar');
const TestUtils = React.addons.TestUtils;

describe('foo/foo', () => {

    let component;

    beforeEach(() => {
        component = TestUtils.renderIntoDocument(<Foo />);
    });

    it('has a title', () => {
        let title = TestUtils.findRenderedDOMComponentWithClass(component, 'title');
        expect(title.getDOMNode().tagName).toBe('H1');
        expect(title.getDOMNode().textContent).toBe('Hello');
    });

    it('renders Bar', () => {
        let bar = TestUtils.findRenderedComponentWithType(component, Bar);
        expect(bar).toBeTruthy();
    });

});