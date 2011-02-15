#!/usr/bin/env node

var cucumis = require('../lib/cucumis'),
    path = require('path'),
    fs = require('fs'),
	_ = require('underscore'),
	globSync = require('glob').globSync;

// set this to true to disable console colors
var boring = false;

// test timeout
var timeout = 10000;

// Prefer mustache style templates
_.templateSettings = {
  interpolate : /\{\{(.+?)\}\}/g
};

// template for undefined steps
var undefinedStepTemplate = _.template(fs.readFileSync(path.join(__dirname, '../lib/templates/stepdef.js.tpl')).toString());

// uncaught expception handling
var _stepError = {
	id: 0,
	handler: function(id, err) {
		throw err;
	},
};

process.on('uncaughtException', function (err) {
	_stepError.handler(_stepError.id, err);
});

// Load up env.js
globSync(process.cwd() +'/features/**/env.js').forEach(function (env) {
	require(env);
});

// Load up step definitions
var stepDefs = [];
try {
	globSync(process.cwd() +'/features/**/*.js')
		.filter(function(value) {
			return !value.match(/\/env.js$/);
		})
		.forEach(function(file) {
			var mod = require(file);
			if (mod instanceof Array) {
				var newDefs = mod.filter(function (item) {
					return (item.operator) && (item.pattern instanceof RegExp) && (item.generator instanceof Function);
				});
				stepDefs = stepDefs.concat(newDefs);
			}
		});
} catch (err) {
}

var undefinedSteps = {};

var scenarioCount = 0;
var stepCount = 0;

var undefinedStepCount = 0;
var undefinedScenarioCount = 0;

var passedStepCount = 0;
var passedScenarioCount = 0;

var pendingStepCount = 0;
var pendingScenarioCount = 0;

var skippedStepCount = 0;

var failedStepCount = 0;
var failedScenarioCount = 0;
var startTime = Date.now();

runFeatures();

function strJoin() {
	return _.compact(arguments).join(', ');;
}

function runFeatures() {
	var paths = [path.join(process.cwd(), 'features')];
	var p;

	var features = [];

	while (p = paths.shift()) {

		var files = fs.readdirSync(p);

		// find features
		files
			.filter(function(f) { return f.match(/.feature$/) })
			.forEach(function (f) { features.push(path.join(p, f)) });

		// find more directories to traverse
		files
			.filter(function(f) { return fs.statSync(path.join(p, f)).isDirectory(); })
			.forEach(function (f) { paths.push(path.join(p, f)) });
	};

	notifyListeners('beforeTest', function() {
		(function next(){
			if (features.length) {
				runFeature(features.shift(), next);
			} else {
				notifyListeners('afterTest', printReportSummary);
			}
		})();
	});
}

function notifyListeners(eventName, cb, level) {
	level = level || 1;
	var listeners = _.clone(cucumis.Steps.Runner.listeners(eventName));
	(function next() {
		if (listeners.length) {
			var listener = listeners.shift();

			var responseOk = true;

			var id = setTimeout(function() {
				responseOk = false;
				console.log(indent(colorize('red', 'Timeout waiting for response on event: ' + eventName + '\n'), level));
				next();
			}, 100);

			_stepError.id = id;
			_stepError.handler = function(id, err) {
				responseOk = false;
				clearTimeout(id);

				var errors = [];
				errors.push(err.name ? 'name: ' + err.name : '');
				errors.push(err.message ? 'message: ' + err.message : '');
				errors.push(err.stack ? indent(err.stack, 1) : '');

				console.log(indent(colorize('red', 'Error while processing event: ' + eventName), level));
				console.log(indent(colorize('red', errors.join('\n')), level + 1));

				next();
			};

			listener(function() {
				if (responseOk) {
					clearTimeout(id);
					next();
				}
			});
		} else {
			cb();
		}
	})();
}

function printReportSummary() {
	// TODO: implement skipped and pending
	// pending skips the rest of the steps

	var undefinedScenariosStr = undefinedScenarioCount ? colorize('[yellow]{' + undefinedScenarioCount + ' undefined}') : '';
	var undefinedStepsStr = undefinedStepCount ? colorize('[yellow]{' + undefinedStepCount + ' undefined}') : '';

	var passedScenariosStr = passedScenarioCount ? colorize('[green]{' + passedScenarioCount + ' passed}') : '';
	var passedStepsStr = passedStepCount ? colorize('[green]{' + passedStepCount + ' passed}') : '';

	var pendingScenariosStr = pendingScenarioCount ? colorize('[yellow]{' + pendingScenarioCount + ' pending}') : '';
	var pendingStepsStr = pendingStepCount ? colorize('[yellow]{' + pendingStepCount + ' pending}') : '';

	var skippedStepsStr = skippedStepCount ? colorize('[cyan]{' + skippedStepCount + ' skipped}') : '';

	var failedScenariosStr = failedScenarioCount ? colorize('[red]{' + failedScenarioCount + ' failed}') : '';
	var failedStepsStr = failedStepCount ? colorize('[red]{' + failedStepCount + ' failed}') : '';

	console.log(scenarioCount + ' scenarios (' + strJoin(passedScenariosStr, failedScenariosStr, undefinedScenariosStr, pendingScenariosStr) + ')');
	console.log(stepCount + ' steps (' + strJoin(passedStepsStr, failedStepsStr, skippedStepsStr, undefinedStepsStr, pendingStepsStr) + ')');

	var timeElapsed = (Date.now() - startTime)/1000;

	var minutes = Math.floor(timeElapsed / 60);
	var seconds = timeElapsed - minutes*60;

	console.log(minutes + 'm' + seconds.toFixed(3) + 's');
	console.log();

	if (_.keys(undefinedSteps).length) {
		console.log(colorize('[yellow]{You can implement step definitions for undefined steps with these snippets:\n}'));
		console.log(colorize('yellow', 'var Steps = require(\'cucumis\').Steps;\n'));

		for (var undefinedStep in undefinedSteps) {
			console.log(colorize('yellow', undefinedStep));
		}

		console.log(colorize('yellow', 'Steps.export(module);\n'));
	}
}

function runFeature(featureFile, cb) {
	var data = fs.readFileSync(featureFile);
	var ast = cucumis.parse(data.toString());

	// Feature
	for (var index in ast) {

		if (ast[index]) {
			// Extract background
			var background = function(cb) {
				cb();	
			};

			if (ast[index].background) {
				ast[index].background.background = true;
				background = function(cb) {
					runScenario(ast[index].background, cb);
				}
			}

			var feature = ast[index];

			console.log('Feature: ' + feature.name);
			console.log(indent(feature.description, 1));

			notifyListeners('beforeFeature', function() {

				if (feature.scenarios && feature.scenarios.length) {
					// Scenarios
					var scenarios = feature.scenarios;

					(function next(){
						background(function() {
							if (scenarios.length) {
								runScenario(scenarios.shift(), function() {
									notifyListeners('afterFeature', next);
								});
							} else {
								cb();
							}
						});
					})();
				}
			});
		}
	}
}

function runScenario(scenario, cb) {
	scenarioCount++;

	var testState = {
		scenarioState: 'passed',
		scenarioUndefined: false,
		lastStepType: 'GIVEN',
		skip: false,
	};

	if (scenario.background && !scenario.backgroundPrinted) {
		console.log(indent('Background:', 1));
		scenario.backgroundPrinted = true;
	} else {
		console.log(indent('Scenario' + (scenario.outline ? ' Outline' : '') + ': ' + scenario.name, 1));
	}


	notifyListeners('beforeScenario', function() {
		if (scenario.breakdown && scenario.breakdown.length) {
			testState.lastStepType = 'GIVEN';

			var exampleSets = [{}];

			// Parse examples data
			if (scenario.hasExamples) {
				var examples = scenario.examples;
				for (var exampleVar in examples) {
					examples[exampleVar].forEach(function(exampleValue, index) {
						if (!exampleSets[index]) {
							exampleSets[index] = {};
						} 

						exampleSets[index][exampleVar] = exampleValue;
					});
				}
			}

			// Examples
			(function next(){
				testState.skip = false;

				if (exampleSets.length) {
					runExampleSet(scenario, exampleSets.shift(), testState, next);
				} else {
					if (testState.scenarioUndefined) {
						undefinedScenarioCount++;
					} else {
						switch (testState.scenarioState) {
							case 'failed':
								failedScenarioCount++;
								break;

							case 'pending':
								pendingScenarioCount++;
								break;

							case 'passed':
								passedScenarioCount++;
								break;
								
						}
					}

					notifyListeners('afterScenario', cb);
				}
			})();
		}
	});
}

function runExampleSet(scenario, exampleSet, testState, cb) {
	// Steps
	var steps = [];
	scenario.breakdown.forEach(function(breakdown) {
		// Step
		for (var i in breakdown) {
			var step = breakdown[i];
			steps.push(step);
		}
	});

	(function next(){
		if (steps.length) {
			stepCount++;
			notifyListeners('beforeStep', function() {
				runStep(steps.shift(), exampleSet, testState, function() {
					notifyListeners('afterStep', next);
				});
			});
		} else {
			console.log('');
			cb();
		}
	})();
}

function runStep(step, exampleSet, testState, cb) {
	var stepType = step[0];
	if (step[0] == 'AND') {
		stepType = testState.lastStepType;
	}
	testState.lastStepType = stepType;

	function capitalize(str) {
		return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	}

	stepType = capitalize(stepType);

	var stepText = step[1];
	for (var exampleVar in exampleSet) {
		stepText = stepText.replace(new RegExp('<' + exampleVar + '>', 'g'), exampleSet[exampleVar]);
	}

	var stepLine = capitalize(step[0]) + ' ' + stepText;

	testState.foundStepDef = false;
	testState.color = 'green';
	testState.msg = '';

	var myStepDefs = _.clone(stepDefs);

	// Match step definitions against current step
	(function next(){
		if (myStepDefs.length) {
			runStepDef(myStepDefs.shift(), stepType, stepText, testState, next);
		} else {
			if (!testState.foundStepDef) { // Undefined step
				undefinedStepCount++;
				testState.scenarioUndefined = true;

				testState.color = 'yellow';

				// smart parametrization of numbers and strings
				var re = stepText;
				var args = [];

				re = re.replace(/(\s|^)(\d+)(\s|$)/, function(str, m1, m2, m3) {
					args.push('arg' + (args.length + 1));
					return m1 + '(\\d+)' + m3;
				});

				re = re.replace(/("[^"]*?")/g, function(str, m1) {
					args.push('arg' + (args.length + 1));
					return '"([^"]*?)"';
				});

				var snippet = undefinedStepTemplate({type: stepType, title: re, args: [''].concat(args).join(', ')});
				undefinedSteps[snippet] = true;
			}

			console.log(indent(colorize(testState.color, stepLine), 2));
			if (testState.msg) {
				console.log(indent(testState.msg, 3));
			}

			cb();
		}
	})();
}

function runStepDef(stepDef, stepType, stepText, testState, cb) {
	var matches;
	if (!testState.foundStepDef && stepDef.operator.toUpperCase() == stepType.toUpperCase()) {
		if (matches = stepDef.pattern.exec(stepText)) {
			testState.foundStepDef = true;

			if (!testState.skip) {
				// Run step
				var id;
				var runTest = true;
				try {

					id = setTimeout(function(){
						runTest = false;
						stepError(id, new Error('Test timed out (' + timeout + 'ms)'));
					}, timeout);

					_stepError.handler = stepError;
					_stepError.id = id;

					var ctx = {
						done: function() {
							if (runTest) {
								clearTimeout(id);
								testState.color = 'green';
								passedStepCount ++;

								cb();
							}
						},

						pending: function() {
							if (runTest) {
								clearTimeout(id);
								testState.color = 'yellow';
								pendingStepCount ++;

								testState.msg = colorize('yellow', 'TODO: Pending');
								testState.skip = true;

								testState.scenarioState = 'pending';

								cb();
							}
						},
					};

					stepDef.generator.apply({}, [ctx].concat(matches.slice(1)));
				} catch (err) {
					stepError(id, err);
				}
			} else {
				testState.color = 'cyan';
				skippedStepCount ++;
				cb();
			}

			return;
		}
	}

	function stepError(id, err) {
		clearTimeout(id);

		var errors = [];
		errors.push(err.name ? 'name: ' + err.name : '');
		errors.push(err.message ? 'message: ' + err.message : '');
		errors.push(err.stack ? indent(err.stack, 2) : '');
		testState.msg = colorize('red', errors.join('\n'));

		testState.color = 'red';
		failedStepCount ++;
		testState.scenarioState = 'failed';
		testState.skip = true;

		cb();
	}

	cb();
}

/**
 * Colorize the given string using ansi-escape sequences.
 * Disabled when --boring is set.
 *
 * @param {String} str
 * @return {String}
 */

function colorize(color, str){
	var colors = { bold: 1, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36 };
	if (arguments.length == 1) {
		str = color;
		return str.replace(/\[(\w+)\]\{([^]*?)\}/g, function(_, color, str){
			return boring
				? str
				: '\x1B[' + colors[color] + 'm' + str + '\x1B[0m';
		});
	} else {
		return boring
			? str
			: '\x1B[' + colors[color] + 'm' + str + '\x1B[0m';
	}
}


function indent (text, level) {
	level = level || 0;

	var lines = text.split('\n');

	var indents = '';
	_.range(level).forEach(function() {
		indents += '  ';
	});

	for (var i = 0; i < lines.length; i++) {
		lines[i] = indents + lines[i]; 
	}

	return lines.join('\n');
}
