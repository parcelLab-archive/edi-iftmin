var edi = require('../index');
var fs = require('fs');

var file = fs.readFileSync('testfile/UPS.dat', 'utf8');

edi.inspectEdi(file);
