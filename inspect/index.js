var edi = require('../index');
var fs = require('fs');

var files = fs.readdirSync('./files');

for (var i = 0; i < files.length; i++) {

  if (!/^\./.test(files[i])) {

    console.log('Working with ' + files[i]);
    var file = fs.readFileSync('./files/' + files[i], 'utf8');
    edi.inspectEdi(file);

  }

}
