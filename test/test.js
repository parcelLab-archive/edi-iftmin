var edi = require('../index');
var fs = require('fs');

var file = fs.readFileSync('testfile/thomann.txt', 'utf8');

edi.inspectEdi(file);
