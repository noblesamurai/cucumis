#!/usr/bin/env node

var kyuri = require('kyuri'),
    path = require('path'),
    fs = require('fs'),
	_ = require('underscore');

var boring = false;

var stepDefs = [];
var stepDefFiles = fs.readdirSync(path.join(process.cwd(), 'features/step_definitions'));
stepDefFiles.forEach(function (file) {
	if (file.match(/.js$/)) {
		stepDefs = stepDefs.concat(require(path.join(process.cwd(), 'features/step_definitions', file)));
	}
});

var featureFiles = fs.readdirSync(path.join(process.cwd(), 'features'));
var undefinedSteps = {};
featureFiles.forEach(function(featureFile) {
	if (featureFile.match(/.feature$/)) {
		runFeature(stepDefs, path.join(process.cwd(), 'features', featureFile));
	}
});
if (_.keys(undefinedSteps).length) {
	console.log(colorize('[yellow]{You can implement step definitions for undefined steps with these snippets:\n}'));

	for (var undefinedStep in undefinedSteps) {
		console.log(colorize('yellow', undefinedStep));
	}
}

function runFeature(stepDefs, featureFile) {
	var data = fs.readFileSync(featureFile);
	var ast = kyuri.parse(data.toString());

	var topic = {};

	_.templateSettings = {
	  interpolate : /\{\{(.+?)\}\}/g
	};

	var undefinedStepTemplate = _.template(fs.readFileSync(path.join(__dirname, '../lib/templates/stepdef.js.tpl')).toString());

	for (var index in ast) {

		if (ast[index]) {
			var feature = ast[1];
			console.log('Feature: ' + feature.name);
			console.log(feature.description);

			if (feature.scenarios && feature.scenarios.length) {
				feature.scenarios.forEach(function(scenario) {

					console.log('Scenario' + (scenario.outline ? ' Outline' : '') + ': ' + scenario.name);

					if (scenario.breakdown && scenario.breakdown.length) {
						var lastStepType = 'GIVEN';

						var exampleSets = [{}];

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

						exampleSets.forEach(function(exampleSet) {
							scenario.breakdown.forEach(function(steps) {
								for (var i in steps) {
									var step = steps[i];

									var stepType = step[0];
									if (step[0] == 'AND') {
										stepType = lastStepType;
									}
									lastStepType = stepType;

									stepType = stepType.charAt(0).toUpperCase() + stepType.slice(1).toLowerCase();

									var stepText = step[1];
									for (var exampleVar in exampleSet) {
										stepText = stepText.replace(new RegExp('<' + exampleVar + '>', 'g'), exampleSet[exampleVar]);
									}

									var stepLine = step[0] + ' ' + stepText;
									console.log('  ' + stepLine);

									var foundStepDef = false;
									stepDefs.forEach(function (stepDef) {
										var matches;
										if (!foundStepDef && stepDef.operator.toUpperCase() == stepType) {
											if (matches = stepDef.pattern.exec(stepText)) {
												foundStepDef = true;
												var stepFn = stepDef.generator(topic);
												stepFn.apply(stepFn, matches.slice(1));
											}
										}
									});

									if (!foundStepDef) {
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

										var snippet = undefinedStepTemplate({type: stepType, title: re, args: args.join(', ')});
										undefinedSteps[snippet] = true;
									}
								}
							});

							console.log('');
						});

					}
				}); 
			}
		}
	}
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
