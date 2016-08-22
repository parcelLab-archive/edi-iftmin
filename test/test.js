var edi = require('../index');
var fs = require('fs');

var files = fs.readdirSync('./testfile');

for (var i = 0; i < files.length; i++) {

  if (['.DS_Store'].indexOf(files[i]) === -1) {

    console.log('Working with ' + files[i]);
    var file = fs.readFileSync('./testfile/' + files[i], 'utf8');
    edi.inspectEdi(file);

  }

}
