_ = require('underscore');
var fs = require('fs'),
    path = require('path');

module.exports = require('expressobdd')({
	'templating': {
		'it should be able to use underscore': function() {
			_.should.not.equal(undefined);
		},
		'it should be able to use a simple template': function() {
			_.templateSettings = {
			  interpolate : /\{\{(.+?)\}\}/g
			};

			var out = _.template('Hello {{name}}', {name: 'Fred'});
			out.should.eql('Hello Fred');
		},
		'it should be able to read a template from a file': function() {
			fs.readFile(path.join(__dirname, 'fixtures/test.js.tpl'), function(err, data) {
				if (err) throw err;

				var out = _.template(data.toString(), {name: 'Fred'});
				out.should.eql('Hello Fred,\n\nThis is a cool template\n');
			});
		},
	},
});
