var Steps = require('cucumis').Steps,
	assert = require('assert'),
	should = require('should'),
	soda = require('soda');

var browserType = 'firefox';
var browser;

var baseUrl = 'http://www.google.com.au';

var pageMap = {
	'Google': {
		'Home': '/',
	},
};

var fieldMap = {
	'Google': {
		'Search Query': 'q',
		'Search': 'btnG',
	},
};

var lastSite;

Steps.Given(/^I am using the "([^"]*)" browser$/, function (done, bt) {
	browserType = bt;
	browser = soda.createClient({
		host: 'localhost'
	  , port: 4444
	  , url: baseUrl
	  , browser: browserType
	});

	done();
});

Steps.Given(/^I am on the "([^"]*?)" "([^"]*?)" page$/, function (done, site, page) {
	lastSite = site;
	var url = pageMap[site][page];

	browser
		.chain
		.session()
		.open(url)
		.end(function(err) {
			done();
		});
});

Steps.When(/^I enter "([^"]*?)" into the "([^"]*?)" text field$/, function (done, text, field) {
	browser
		.chain
		.type(fieldMap[lastSite][field], text)
		.end(function(err) {
			done();
		});
});

Steps.When(/^I click the "([^"]*?)" "([^"]*?)" button$/, function (done, site, field) {
	lastSite = site;
	browser
		.chain
		.click(fieldMap[site][field])
		.waitForPageToLoad(2000)
		.end(function(err) {
			done();
		});
});

Steps.Then(/^my title should contain "([^"]*?)"$/, function (done, needle) {
	browser
		.chain
		.getTitle(function(title){
			title.should.include.string(needle);
		})
		.end(function(err) {
			if (err) throw err;
			done();
		});
});

Steps.export(module);
