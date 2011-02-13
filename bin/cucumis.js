#!/usr/bin/env node

var kyuri = require('kyuri');
var path = require('path');
var fs = require('fs');

var stepDefs = [];
var stepDefFiles = fs.readdirSync(path.join(process.cwd(), 'features/step_definitions'));
stepDefFiles.forEach(function (file) {
	if (file.match(/.js$/)) {
		stepDefs = stepDefs.concat(require(path.join(process.cwd(), 'features/step_definitions', file)));
	}
});

var featureFiles = fs.readdirSync(path.join(process.cwd(), 'features'));
featureFiles.forEach(function(featureFile) {
	if (featureFile.match(/.feature$/)) {
		runFeature(stepDefs, path.join(process.cwd(), 'features', featureFile));
	}
});

function runFeature(stepDefs, featureFile) {
	var data = fs.readFileSync(featureFile);
	var ast = kyuri.parse(data.toString());

	var topic = {};

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
										console.log('    Undefined Step!');
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
