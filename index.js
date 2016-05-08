var _ = require('underscore');
var yaml = require('js-yaml');
var fs = require('fs');

// Get document, or throw exception on error
try {
  var _c = yaml.safeLoad(fs.readFileSync(__dirname + '/config.yml', 'utf8'));
} catch (e) {
  throw e;
}

///////////////////////
// Utility Functions //
///////////////////////

function clone(object) {
  var string = JSON.stringify(object);
  if (typeof string !== 'undefined') return (JSON.parse(string));
  else return null;
}

function select(object, selector) {
  var path = selector.split('.');
  var obj = clone(object);
  for (var i = 0; i < path.length; i++) {
    if (_.has(obj, path[i])) obj = obj[path[i]];
    else return null;
  }

  return obj;
}

function printWithIndent(indent, string) {
  var indentation = '';
  for (var i = 0; i < indent; i++) {
    indentation += '  ';
  }

  console.log(indentation + string);
}

function isValid(value) {
  return !_.isNull(value) && !_.isUndefined(value) && value !== '';
}

///////////////////
// EDI Functions //
///////////////////

function splitIntoInterchanges(edi) {
  return edi.match(/UNB\+.*?UNZ\+[^\']*\'+?/g);
}

function splitIntoMessages(batch) {
  return batch.match(/UNH\+.*?UNT\+[^\']*\'+?/g);
}

function splitIntoSegments(message) {
  return message.split('\'');
}

function splitIntoDataElements(message) {
  return message.replace(/\'/g, '').split('+');
}

////////////////////////
// Advanced Functions //
////////////////////////

function splitListAndRestOfMessage(message) {
  var listRegEx = /(GID\+.*?\')(?=GID\+.*?\'|UNT\+.*?\')/g;
  var list = message.match(listRegEx);
  var restOfMessage = message.replace(listRegEx, '');
  return {
    message: restOfMessage,
    list: list,
  };
}

function parseMessageSegment(segment) {
  var dataElements = splitIntoDataElements(segment);
  if (_.has(_c, dataElements[0])) {

    // get encoding
    var dataElementEncoding = _c[dataElements[0]].elements;
    var nesting = _.has(_c[dataElements[0]], 'nesting') ? _c[dataElements[0]].nesting : null;

    // prepare return
    var parsedMessageSegment = clone(_c[dataElements[0]]);
    delete parsedMessageSegment.elements;
    delete parsedMessageSegment.nesting;

    // parse data elements
    var parsedDataElements = parseDataElements(dataElements, dataElementEncoding);

    // nest data elements if there's an additional identifier
    if (nesting) {

      // determine where to look for the nesting identifier, e.g. RFF+IV:123 or NAD+OS+123
      var nestIdentifierLocation = nesting.nest.indexOf(':') > -1 ?
        nesting.nest.split(':') : [nesting.nest, null];

      var nest = parsedDataElements[nestIdentifierLocation[0]];
      var nestValue = _.isNull(nestIdentifierLocation[1]) ?
        nest.value : nest.value.split(':')[nestIdentifierLocation[1]];
      var nestName = _.has(nesting, nestValue) ? nesting[nestValue] : nestValue;

      parsedMessageSegment[nestValue] = {
        name: nestName,
        raw: segment,
      };

      parsedMessageSegment[nestValue] =
        _.extend(parsedMessageSegment[nestValue], parsedDataElements);

    } else {

      parsedMessageSegment.raw = segment;
      parsedMessageSegment = _.extend(parsedMessageSegment, parsedDataElements);

    }

    return {
      code: dataElements[0],
      message: parsedMessageSegment,
    };
  } else return null;
}

function parseDataElements(dataElements, dataElementEncoding) {
  var parsedDataElements = {};

  for (var i = 1; i < dataElements.length; i++) {
    var dataElementId = '0' + i + '0';
    var dataElement = {};

    if (_.has(dataElementEncoding, dataElementId)) {
      if (_.has(dataElementEncoding[dataElementId], 'name'))
        dataElement.name = dataElementEncoding[dataElementId].name;
      else
        dataElement.name = dataElementEncoding[dataElementId];
    }

    var dataElementValue = dataElements[i];
    dataElement.value = dataElementValue;

    if (dataElementValue.indexOf(':') > -1) {

      var dataElementComponents = dataElementValue.split(':');
      var decEnc = _.has(dataElementEncoding, 'dataElementId') &&
        _.has(dataElementEncoding[dataElementId], 'elements') ?
        dataElementEncoding[dataElementId].elements : null;
      var parsedDataElementComponents = parseDataElementComponents(dataElementComponents, decEnc);

      dataElement = _.extend(dataElement, parsedDataElementComponents);

    }

    parsedDataElements[dataElementId] = dataElement;
  }

  return parsedDataElements;
}

function parseDataElementComponents(dataElementComponents, dataElementComponentEncoding) {
  var parsedDataElementComponents = {};

  for (var i = 0; i < dataElementComponents.length; i++) {
    var dataElementComponentId = '' + i;
    var dataElementComponent = {};

    if (_.has(dataElementComponentEncoding, dataElementComponentId))
      dataElementComponent.name = dataElementComponentEncoding[dataElementComponentId];
    dataElementComponent.value = dataElementComponents[i];

    parsedDataElementComponents[dataElementComponentId] = dataElementComponent;
  }

  return parsedDataElementComponents;
}

function inspectNode(name, node, indent) {

  var title = name;
  if (isValid(node.name)) title += ': ' + node.name;
  if (isValid(node.raw)) title += ' (raw: ' + node.raw + ')';
  if (isValid(node.value)) title += ' # ' + node.value;
  printWithIndent(indent, title);

  var subNodes = _.keys(node);
  for (var i = 0; i < subNodes.length; i++) {
    if (subNodes[i] !== 'name' && subNodes[i] !== 'raw' && subNodes[i] !== 'value') {
      inspectNode(subNodes[i], node[subNodes[i]], indent + 1);
    }
  }

}

//////////////
// External //
//////////////

function parseEdi(edi) {

  var result = [];

  var interchanges = splitIntoInterchanges(edi);
  for (var i = 0; i < interchanges.length; i++) {

    var messages = splitIntoMessages(interchanges[i]);
    for (var j = 0; j < messages.length; j++) {
      var _this = splitListAndRestOfMessage(messages[j]);
      var resultMessage = {
        unknown: [],
      };

      // read the 'rest of the message', i.e. everything but the list
      var messageSegments = splitIntoSegments(_this.message);
      for (var k = 0; k < messageSegments.length; k++) {

        var parsed = parseMessageSegment(messageSegments[k]);
        if (!_.isNull(parsed)) {
          if (_.has(resultMessage, parsed.code)) {
            resultMessage[parsed.code] = _.extend(resultMessage[parsed.code], parsed.message);
          } else resultMessage[parsed.code] = parsed.message;
        } else resultMessage.unknown.push(messageSegments[k]);

      }

      // read the list
      var listItems = [];
      if (!_.isNull(_this.list)) {
        for (var l = 0; l < _this.list.length; l++) {
          var listMessageSegments = splitIntoSegments(_this.list[l]);
          var parsedListElement = {};

          for (var m = 0; m < listMessageSegments.length; m++) {
            var parsed2 = parseMessageSegment(listMessageSegments[m]);
            if (!_.isNull(parsed2)) parsedListElement[parsed2.code] = parsed2.message;
            else resultMessage.unknown.push(listMessageSegments[m]);
          }

          listItems.push(parsedListElement);
        }
      }

      // multiply the rest of the message with the list to break down into single complete records
      if (!_.isNull(_this.list)) {
        for (var n = 0; n < listItems.length; n++) {
          result.push(_.extend(clone(resultMessage), listItems[n]));
        }
      } else result.push(resultMessage);

    }

  }

  return result;

}

function inspectEdi(edi) {
  var json = parseEdi(edi);

  console.log(json);

  for (var i = 0; i < json.length; i++) {
    console.log('Message ' + i);
    var segments = _.keys(json[i]);

    for (var j = 0; j < segments.length; j++) {
      if (segments[j] !== 'unknown') {
        inspectNode(segments[j], json[i][segments[j]], 1);
      }
    }

    printWithIndent(1, 'Missing matchings');
    for (var k = 0; k < json[i].unknown.length; k++) {
      printWithIndent(2, json[i].unknown[k]);
    }

  }
}

module.exports = {
  parseEdi: parseEdi,
  inspectEdi: inspectEdi,
  selectWithPath: select,
};
