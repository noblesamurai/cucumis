/*
 * Addition.feature
 * Step definitions for Feature: 'Addition'
 *
 * Auto-generated using Kyuri: http://github.com/nodejitsu/kyuri
 */
 
var kyuri = require('kyuri'),
    Steps = require('kyuri').Steps;

require('should');

var Calculator = function() {
	this._stack = [];
};

Calculator.prototype = {
	enter: function (value) {
		this._stack.push(value);
	},

	get stack() {
		return this._stack;
	},

	add: function() {
		this._stack.push(this._stack.pop() + this._stack.pop());
	},

	result: function() {
		return this._stack[this._stack.length - 1];
	},
};

var calc;

//
// Step definitions for Scenario: Add two numbers
//

Steps.Given(/^I have a calculator$/, function(topic) {
	return function() {

		calc = new Calculator();

		return topic;
	};
});

Steps.Given(/^I have entered (\d+) into the calculator$/, function (topic) {
  return function (value) {
    // Always use or extend the same topic since you don't 
    // know how nested or not nested you are at this point
    topic = topic || {};
    
	calc.enter(parseInt(value));

    return topic;
  };
});

Steps.When(/^I press add$/, function (topic) {
  return function () {
    // Always use or extend the same topic since you don't 
    // know how nested or not nested you are at this point
    topic = topic || {};
    
	calc.add();
    
    return topic;
  };
});

Steps.Then(/^the result should be (\d+) on the screen$/, function (topic) {
  return function (value) {
  	calc.result().should.eql(parseInt(value));
  };
});

Steps.export(module);
