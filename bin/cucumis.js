#!/usr/bin/env node

var kyuri = require('kyuri'),
    path = require('path'),
    fs = require('fs'),
	_ = require('underscore');

// set this to true to disable console colors
var boring = false;

// test timeout
var timeout = 2000;

// Prefer mustache style templates
_.templateSettings = {
  interpolate : /\{\{(.+?)\}\}/g
};

// template for undefined steps
var undefinedStepTemplate = _.template(fs.readFileSync(path.join(__dirname, '../lib/templates/stepdef.js.tpl')).toString());

// Load up step definitions
var stepDefs = [];
try {
	var stepDefFiles = fs.readdirSync(path.join(process.cwd(), 'features/step_definitions'));
	stepDefFiles.forEach(function (file) {
		if (file.match(/.js$/)) {
			stepDefs = stepDefs.concat(require(path.join(process.cwd(), 'features/step_definitions', file)));
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

var failedStepCount = 0;
var failedScenarioCount = 0;
var startTime = Date.now();

runFeatures();
process.on('exit', printReportSummary);

function strJoin() {
	return _.compact(arguments).join(', ');;
}

function runFeatures() {
	var featureFiles = fs.readdirSync(path.join(process.cwd(), 'features'));

	var features = [];
	featureFiles.forEach(function(featureFile) {
		if (featureFile.match(/.feature$/)) {
			features.push(path.join(process.cwd(), 'features', featureFile));
		}
	});

	(function next(){
		if (features.length) {
			runFeature(features.shift(), next);
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

	var failedScenariosStr = failedScenarioCount ? colorize('[red]{' + failedScenarioCount + ' failed}') : '';
	var failedStepsStr = failedStepCount ? colorize('[red]{' + failedStepCount + ' failed}') : '';

	console.log(scenarioCount + ' scenarios (' + strJoin(passedScenariosStr, failedScenariosStr, undefinedScenariosStr) + ')');
	console.log(stepCount + ' steps (' + strJoin(passedStepsStr, failedStepsStr, undefinedStepsStr) + ')');

	var timeElapsed = (Date.now() - startTime)/1000;

	var minutes = Math.floor(timeElapsed / 60);
	var seconds = timeElapsed - minutes*60;

	console.log(minutes + 'm' + seconds.toFixed(3) + 's');
	console.log();

	if (_.keys(undefinedSteps).length) {
		console.log(colorize('[yellow]{You can implement step definitions for undefined steps with these snippets:\n}'));
		console.log(colorize('yellow', 'var Steps = require(\'kyuri\').Steps;\n'));

		for (var undefinedStep in undefinedSteps) {
			console.log(colorize('yellow', undefinedStep));
		}
	}
}

function runFeature(featureFile, cb) {
	var data = fs.readFileSync(featureFile);
	var ast = kyuri.parse(data.toString());

	// Feature
	for (var index in ast) {

		if (ast[index]) {
			var feature = ast[index];
			console.log('Feature: ' + feature.name);
			console.log(indent(feature.description, 1));

			if (feature.scenarios && feature.scenarios.length) {
				// Scenarios
				var scenarios = feature.scenarios;

				(function next(){
					if (scenarios.length) {
						runScenario(scenarios.shift(), next);
					} else {
						cb();
					}
				})();
			}
		}
	}
}

function runScenario(scenario, cb) {
	scenarioCount++;

	var testState = {
		scenarioUndefined: false,
		scenarioFailed: false,
		lastStepType: 'GIVEN',
	};

	console.log('Scenario' + (scenario.outline ? ' Outline' : '') + ': ' + scenario.name);

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
			if (exampleSets.length) {
				runExampleSet(scenario, exampleSets.shift(), testState, next);
			} else {
				if (testState.scenarioUndefined) {
					undefinedScenarioCount++;
				}

				if (testState.scenarioFailed) {
					failedScenarioCount++;
				} else {
					passedScenarioCount++;
				}

				cb();
			}
		})();
	}

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
			runStep(steps.shift(), exampleSet, testState, next);
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
	testState.errMsg = '';

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

				re = re.replace(/(\s|^)("[^']*")(\s|$)/, function(str, m1, m2, m3) {
					args.push('arg' + (args.length + 1));
					return m1 + '"([^"]*)"' + m3;
				});

				var snippet = undefinedStepTemplate({type: stepType, title: re, args: [''].concat(args).join(', ')});
				undefinedSteps[snippet] = true;
			}

			console.log(colorize(testState.color, '  ' + stepLine));
			if (testState.errMsg) {
				console.log(colorize('red', indent(testState.errMsg, 2)));
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

			var topic = {};

			// Run step
			var id;
			var runTest = true;
			try {
				id = setTimeout(function(){
					runTest = false;
					stepError(id, new Error('Test timed out (' + timeout + 'ms)'));
				}, timeout);

				var done = function() {
					if (runTest) {
						clearTimeout(id);
						testState.color = 'green';
						passedStepCount ++;

						cb();
					}
				};
				
				stepDef.generator.apply({}, [done].concat(matches.slice(1)));
			} catch (err) {
				stepError(id, err);
			}
			return;
		}
	}

	function stepError(id, err) {
		clearTimeout(id);

		var errors = [];
		errors.push(err.name ? 'name: ' + err.name : '');
		errors.push(err.message ? 'message: ' + err.message : '');
		errors.push(err.stack ? indent(err.stack, 1) : '');
		testState.errMsg = errors.join('\n');

		testState.color = 'red';
		failedStepCount ++;
		testState.scenarioFailed = true;

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
	var colors = { bold: 1, red: 31, green: 32, yellow: 33 };
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
