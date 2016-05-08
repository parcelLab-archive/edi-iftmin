var edi = require('../index');
var fs = require('fs');

var file = fs.readFileSync('testfile/UPS-breaking.dat', 'utf8');

edi.inspectEdi(file);
