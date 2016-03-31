/* eslint-env jasmine */

'use strict';

beforeEach(function() {
    this.addMatchers({
        toBeInstanceOf: function(constructor) {
            let actual = this.actual;
            let notText = this.isNot ? ' not' : '';
            this.message = () => {
                return 'Expected ' + actual.constructor.name + notText + ' to be instance of ' + constructor.name;
            };
            return actual instanceof constructor;
        }
    });
});
