var Steps = require('kyuri').Steps;

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

	subtract: function() {
		this._stack.push(-(this._stack.pop() - this._stack.pop()));
	},

	result: function() {
		return this._stack[this._stack.length - 1];
	},
};

var calc;

Steps.Given(/^I have a calculator$/, function(done) {
	calc = new Calculator();
	setTimeout(function() {
		done();
	}, 10);
});

Steps.Given(/^I have entered (\d+) into the calculator$/, function (done, value) {
	calc.enter(parseInt(value));
	done();
});

Steps.When(/^I press add$/, function (done) {
	calc.add();
	done();
});

Steps.Then(/^the result should be (\d+) on the screen$/, function (done, value) {
	calc.result().should.eql(parseInt(value));
	done();
});

Steps.When(/^I press subtract$/, function (done) {
	calc.subtract();
	done();
});

Steps.export(module);
